import { describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import {
  createToastSystem,
  type Toast,
  type ToastSystemDeps,
} from '../src/lib/stores/toast-system.js';

function makeFakeClock() {
  let current = 0;
  type Scheduled = { id: number; at: number; fn: () => void };
  const scheduled: Scheduled[] = [];
  let nextId = 1;

  const deps: ToastSystemDeps = {
    now: () => current,
    randomId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
    setTimeoutFn: ((fn: () => void, ms: number) => {
      const id = nextId++;
      scheduled.push({ id, at: current + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as ToastSystemDeps['setTimeoutFn'],
    clearTimeoutFn: ((handle: ReturnType<typeof setTimeout>) => {
      const idx = scheduled.findIndex((s) => s.id === (handle as unknown as number));
      if (idx >= 0) scheduled.splice(idx, 1);
    }) as ToastSystemDeps['clearTimeoutFn'],
  };

  return {
    deps,
    advance(ms: number) {
      current += ms;
      while (true) {
        const due = scheduled.filter((s) => s.at <= current).sort((a, b) => a.at - b.at);
        if (due.length === 0) break;
        const next = due[0];
        const idx = scheduled.indexOf(next);
        scheduled.splice(idx, 1);
        next.fn();
      }
    },
    setNow(ms: number) {
      current = ms;
    },
    pending: () => scheduled.length,
  };
}

function snapshot<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
  return get(store as never) as T;
}

describe('createToastSystem', () => {
  test('basic push adds a toast with computed expiresAt', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.success('Saved');
    const list = snapshot<Toast[]>(sys.toasts);
    expect(list).toHaveLength(1);
    expect(list[0].variant).toBe('success');
    expect(list[0].durationMs).toBe(4000);
    expect(list[0].expiresAt).toBe(4000);
    expect(h.alive).toBe(true);
    expect(h.id).toBe(list[0].id);
  });

  test('timer fires and removes toast, handle becomes not-alive', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.success('Saved');
    clock.advance(4000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
    expect(h.alive).toBe(false);
    expect(h.id).toBeNull();
  });

  test('dedupe replace returns SAME canonical handle and swaps row', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const first = sys.toast.success('A', { dedupeKey: 'k' });
    const firstId = first.id;
    const second = sys.toast.success('B', { dedupeKey: 'k' });
    expect(second).toBe(first);
    expect(first.alive).toBe(true);
    expect(first.id).not.toBe(firstId);
    const list = snapshot<Toast[]>(sys.toasts);
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe('B');
    expect(list[0].id).toBe(first.id);
  });

  test('dedupe replace resets timer', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    sys.toast.success('A', { dedupeKey: 'k' });
    clock.advance(3000);
    sys.toast.success('B', { dedupeKey: 'k' });
    clock.advance(3000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(1);
    clock.advance(1000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
  });

  test('cleanupToast marks handle not-alive and removes dedupe entry', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.success('A', { dedupeKey: 'k' });
    sys.dismissToast(h.id as string);
    expect(h.alive).toBe(false);
    // Pushing same dedupeKey should create a new handle (since previous was cleaned up).
    const h2 = sys.toast.success('A2', { dedupeKey: 'k' });
    expect(h2).not.toBe(h);
    expect(h2.alive).toBe(true);
  });

  test('pause(hover) + pause(focus) + resume(focus) keeps timer paused', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.success('A');
    const id = h.id as string;
    clock.advance(1000);
    sys.pauseToast(id, 'hover');
    clock.advance(10000);
    sys.pauseToast(id, 'focus');
    clock.advance(10000);
    sys.resumeToast(id, 'focus');
    // Still paused via hover, no timer running. Advance way past default duration.
    clock.advance(10000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(1);
  });

  test('resume last reason re-arms with exact remainingMs', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.success('A');
    const id = h.id as string;
    clock.advance(1000); // 3000ms remaining
    sys.pauseToast(id, 'hover');
    clock.advance(10000);
    sys.resumeToast(id, 'hover');
    clock.advance(2999);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(1);
    clock.advance(1);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
  });

  test('cap drops oldest non-sticky via cleanup; no stale timers', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    for (let i = 0; i < 5; i++) sys.toast.info(`m${i}`);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(5);
    const pendingBefore = clock.pending();
    sys.toast.info('m5');
    const list = snapshot<Toast[]>(sys.toasts);
    expect(list).toHaveLength(5);
    expect(list[0].message).toBe('m1');
    expect(list[list.length - 1].message).toBe('m5');
    // Cap dropped one non-sticky toast and armed a timer for the new one, so net pending is unchanged.
    expect(clock.pending()).toBe(pendingBefore);
  });

  test('sticky-overflow: all 5 sticky + 6th still renders (documented exception)', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    for (let i = 0; i < 5; i++) sys.toast.loading(`l${i}`);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(5);
    sys.toast.loading('l5');
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(6);
  });

  test('clearToasts clears all timers and handles', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const a = sys.toast.success('A');
    const b = sys.toast.success('B', { dedupeKey: 'k' });
    sys.clearToasts();
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(clock.pending()).toBe(0);
    // Pushing same dedupeKey again works (map was cleared).
    const c = sys.toast.success('C', { dedupeKey: 'k' });
    expect(c.alive).toBe(true);
  });

  test('stale handle update/dismiss after drop are strict no-ops', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.success('A');
    sys.dismissToast(h.id as string);
    expect(h.alive).toBe(false);
    // No-op should not throw or resurrect.
    h.update({ message: 'B' });
    h.dismiss();
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
  });

  test('loading -> update -> success updates same row via canonical handle', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.loading('Saving...');
    const list = snapshot<Toast[]>(sys.toasts);
    expect(list).toHaveLength(1);
    expect(list[0].variant).toBe('info');
    expect(list[0].durationMs).toBe(0);
    h.update({ variant: 'success', message: 'Saved', durationMs: 4000 });
    const after = snapshot<Toast[]>(sys.toasts);
    expect(after).toHaveLength(1);
    expect(after[0].variant).toBe('success');
    expect(after[0].message).toBe('Saved');
    expect(after[0].durationMs).toBe(4000);
    clock.advance(4000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
  });

  test('non-dismissible sticky error never expires automatically', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.error('Blocking', { durationMs: 0, dismissible: false });
    clock.advance(1_000_000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(1);
    expect(h.alive).toBe(true);
    // Handle-initiated dismiss still works (programmatic).
    h.dismiss();
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
  });

  test('resume without prior pause is a no-op', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.success('A');
    sys.resumeToast(h.id as string, 'hover');
    clock.advance(4000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(0);
  });

  test('pause/resume on sticky toast is a no-op', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.loading('Loading');
    const id = h.id as string;
    sys.pauseToast(id, 'hover');
    sys.resumeToast(id, 'hover');
    clock.advance(1_000_000);
    expect(snapshot<Toast[]>(sys.toasts)).toHaveLength(1);
  });

  test('update preserves dedupeKey (canonical handle invariant)', () => {
    const clock = makeFakeClock();
    const sys = createToastSystem(clock.deps);
    const h = sys.toast.loading('A', { dedupeKey: 'k' });
    h.update({ variant: 'success', message: 'B', durationMs: 4000 });
    const list = snapshot<Toast[]>(sys.toasts);
    expect(list).toHaveLength(1);
    expect(list[0].dedupeKey).toBe('k');
    const h2 = sys.toast.success('C', { dedupeKey: 'k' });
    expect(h2).toBe(h);
  });
});
