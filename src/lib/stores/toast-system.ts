import { writable, type Readable } from 'svelte/store';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  durationMs: number;
  dismissible: boolean;
  createdAt: number;
  expiresAt: number | null;
  remainingMs: number;
  dedupeKey?: string;
}

export type PauseReason = 'hover' | 'focus';

export interface ToastHandle {
  readonly id: string | null;
  readonly alive: boolean;
  dismiss(): void;
  update(patch: Partial<Pick<Toast, 'message' | 'title' | 'variant' | 'durationMs'>>): void;
}

export interface ToastInput {
  variant: ToastVariant;
  message: string;
  title?: string;
  durationMs?: number;
  dismissible?: boolean;
  dedupeKey?: string;
}

export interface ToastSystemDeps {
  now?: () => number;
  randomId?: () => string;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface ToastSystem {
  toasts: Readable<Toast[]>;
  pushToast(input: ToastInput): ToastHandle;
  replaceToast(dedupeKey: string, next: ToastInput): ToastHandle;
  dismissToast(id: string): void;
  pauseToast(id: string, reason: PauseReason): void;
  resumeToast(id: string, reason: PauseReason): void;
  clearToasts(): void;
  toast: {
    success(message: string, opts?: Partial<ToastInput>): ToastHandle;
    info(message: string, opts?: Partial<ToastInput>): ToastHandle;
    warning(message: string, opts?: Partial<ToastInput>): ToastHandle;
    error(message: string, opts?: Partial<ToastInput>): ToastHandle;
    loading(message: string, opts?: Partial<ToastInput>): ToastHandle;
  };
}

const MAX_VISIBLE = 5;

const DEFAULTS: Record<ToastVariant, { durationMs: number; dismissible: boolean }> = {
  success: { durationMs: 4000, dismissible: true },
  info: { durationMs: 4000, dismissible: true },
  warning: { durationMs: 5000, dismissible: true },
  error: { durationMs: 8000, dismissible: true },
};

export function createToastSystem(deps: ToastSystemDeps = {}): ToastSystem {
  const now = deps.now ?? (() => Date.now());
  const randomId = deps.randomId ?? (() => crypto.randomUUID());
  const setT: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> =
    deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT: (h: ReturnType<typeof setTimeout>) => void =
    deps.clearTimeoutFn ?? ((h) => clearTimeout(h));

  const toasts = writable<Toast[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pauseReasons = new Map<string, Set<PauseReason>>();
  const handlesByDedupeKey = new Map<string, ToastHandle>();
  // Tracks the closure refs behind each handle so we can mutate them centrally.
  const handleRefs = new Map<string, { currentId: string | null }>();

  function readToasts(): Toast[] {
    let snapshot: Toast[] = [];
    toasts.update((list) => {
      snapshot = list;
      return list;
    });
    return snapshot;
  }

  function findById(list: Toast[], id: string): Toast | undefined {
    return list.find((t) => t.id === id);
  }

  function armTimer(id: string, durationMs: number): void {
    if (durationMs <= 0) return;
    const handle = setT(() => {
      cleanupToast(id);
    }, durationMs);
    timers.set(id, handle);
  }

  function clearTimer(id: string): void {
    const h = timers.get(id);
    if (h !== undefined) {
      clearT(h);
      timers.delete(id);
    }
  }

  // Terminal removal: user dismiss, timer fire, clearToasts, cap overflow.
  function cleanupToast(id: string): void {
    clearTimer(id);
    pauseReasons.delete(id);

    let dedupeKey: string | undefined;
    toasts.update((list) => {
      const target = findById(list, id);
      if (target) dedupeKey = target.dedupeKey;
      return list.filter((t) => t.id !== id);
    });

    if (dedupeKey !== undefined) handlesByDedupeKey.delete(dedupeKey);

    const ref = handleRefs.get(id);
    if (ref) {
      ref.currentId = null;
      handleRefs.delete(id);
    }
  }

  // Handle-preserving swap: dedupe replacement, handle.update.
  function replaceToastRow(oldId: string, nextRow: Toast): void {
    clearTimer(oldId);
    pauseReasons.delete(oldId);

    toasts.update((list) => list.map((t) => (t.id === oldId ? nextRow : t)));

    const ref = handleRefs.get(oldId);
    if (ref) {
      ref.currentId = nextRow.id;
      handleRefs.delete(oldId);
      handleRefs.set(nextRow.id, ref);
    }

    armTimer(nextRow.id, nextRow.durationMs);
  }

  function enforceCap(): void {
    const list = readToasts();
    if (list.length <= MAX_VISIBLE) return;
    // Drop oldest non-sticky if any exists; otherwise keep all (cap exceeded intentionally).
    const oldestNonSticky = list.find((t) => t.durationMs > 0);
    if (!oldestNonSticky) return;
    cleanupToast(oldestNonSticky.id);
  }

  function buildRow(input: ToastInput): Toast {
    const defaults = DEFAULTS[input.variant];
    const durationMs = input.durationMs ?? defaults.durationMs;
    const dismissible = input.dismissible ?? defaults.dismissible;
    const createdAt = now();
    return {
      id: randomId(),
      variant: input.variant,
      title: input.title,
      message: input.message,
      durationMs,
      dismissible,
      createdAt,
      expiresAt: durationMs > 0 ? createdAt + durationMs : null,
      remainingMs: durationMs,
      dedupeKey: input.dedupeKey,
    };
  }

  function createHandle(initialId: string): ToastHandle {
    const ref: { currentId: string | null } = { currentId: initialId };
    handleRefs.set(initialId, ref);

    const handle: ToastHandle = {
      get id() {
        return ref.currentId;
      },
      get alive() {
        return ref.currentId !== null;
      },
      dismiss() {
        if (ref.currentId === null) return;
        cleanupToast(ref.currentId);
      },
      update(patch) {
        if (ref.currentId === null) return;
        const list = readToasts();
        const current = findById(list, ref.currentId);
        if (!current) return;
        const variant = patch.variant ?? current.variant;
        const durationMs = patch.durationMs ?? current.durationMs;
        const nextCreatedAt = now();
        const nextRow: Toast = {
          ...current,
          id: randomId(),
          variant,
          title: patch.title !== undefined ? patch.title : current.title,
          message: patch.message ?? current.message,
          durationMs,
          createdAt: nextCreatedAt,
          expiresAt: durationMs > 0 ? nextCreatedAt + durationMs : null,
          remainingMs: durationMs,
        };
        replaceToastRow(ref.currentId, nextRow);
      },
    };

    return handle;
  }

  function pushToast(input: ToastInput): ToastHandle {
    if (input.dedupeKey) {
      const existing = handlesByDedupeKey.get(input.dedupeKey);
      if (existing && existing.alive) {
        existing.update({
          message: input.message,
          title: input.title,
          variant: input.variant,
          durationMs: input.durationMs,
        });
        return existing;
      }
    }

    const row = buildRow(input);
    toasts.update((list) => [...list, row]);
    const handle = createHandle(row.id);
    if (row.dedupeKey) handlesByDedupeKey.set(row.dedupeKey, handle);
    armTimer(row.id, row.durationMs);
    enforceCap();
    return handle;
  }

  function replaceToast(dedupeKey: string, next: ToastInput): ToastHandle {
    return pushToast({ ...next, dedupeKey });
  }

  function dismissToast(id: string): void {
    cleanupToast(id);
  }

  function pauseToast(id: string, reason: PauseReason): void {
    const list = readToasts();
    const target = findById(list, id);
    if (!target) return;
    if (target.durationMs <= 0) return;

    let reasons = pauseReasons.get(id);
    const wasEmpty = !reasons || reasons.size === 0;
    if (!reasons) {
      reasons = new Set<PauseReason>();
      pauseReasons.set(id, reasons);
    }
    reasons.add(reason);

    if (wasEmpty && timers.has(id)) {
      clearTimer(id);
      const nextRemaining =
        target.expiresAt !== null ? Math.max(0, target.expiresAt - now()) : target.remainingMs;
      toasts.update((list) =>
        list.map((t) => (t.id === id ? { ...t, expiresAt: null, remainingMs: nextRemaining } : t))
      );
    }
  }

  function resumeToast(id: string, reason: PauseReason): void {
    const reasons = pauseReasons.get(id);
    if (!reasons) return;
    reasons.delete(reason);
    if (reasons.size > 0) return;

    pauseReasons.delete(id);

    const list = readToasts();
    const target = findById(list, id);
    if (!target) return;
    if (target.durationMs <= 0) return;
    if (timers.has(id)) return;

    const remaining = Math.max(0, target.remainingMs);
    const nextExpiresAt = now() + remaining;
    toasts.update((list) =>
      list.map((t) => (t.id === id ? { ...t, expiresAt: nextExpiresAt } : t))
    );
    armTimer(id, remaining);
  }

  function clearToasts(): void {
    const list = readToasts();
    for (const t of list) {
      clearTimer(t.id);
      pauseReasons.delete(t.id);
      const ref = handleRefs.get(t.id);
      if (ref) {
        ref.currentId = null;
        handleRefs.delete(t.id);
      }
      if (t.dedupeKey) handlesByDedupeKey.delete(t.dedupeKey);
    }
    toasts.set([]);
  }

  const toast = {
    success: (message: string, opts: Partial<ToastInput> = {}) =>
      pushToast({ ...opts, message, variant: 'success' }),
    info: (message: string, opts: Partial<ToastInput> = {}) =>
      pushToast({ ...opts, message, variant: 'info' }),
    warning: (message: string, opts: Partial<ToastInput> = {}) =>
      pushToast({ ...opts, message, variant: 'warning' }),
    error: (message: string, opts: Partial<ToastInput> = {}) =>
      pushToast({ ...opts, message, variant: 'error' }),
    loading: (message: string, opts: Partial<ToastInput> = {}) =>
      pushToast({
        durationMs: 0,
        dismissible: opts.dismissible ?? false,
        ...opts,
        message,
        variant: 'info',
      }),
  };

  return {
    toasts: { subscribe: toasts.subscribe },
    pushToast,
    replaceToast,
    dismissToast,
    pauseToast,
    resumeToast,
    clearToasts,
    toast,
  };
}
