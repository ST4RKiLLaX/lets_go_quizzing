import { browser } from '$app/environment';
import {
  createToastSystem,
  type PauseReason,
  type Toast,
  type ToastHandle,
  type ToastInput,
  type ToastVariant,
} from './toast-system';

export type { Toast, ToastHandle, ToastInput, ToastVariant, PauseReason };

const noopHandle: ToastHandle = {
  get id() {
    return null;
  },
  get alive() {
    return false;
  },
  dismiss() {},
  update() {},
};

const system = createToastSystem();

export const toasts = system.toasts;

export function pushToast(input: ToastInput): ToastHandle {
  if (!browser) return noopHandle;
  return system.pushToast(input);
}

export function replaceToast(dedupeKey: string, next: ToastInput): ToastHandle {
  if (!browser) return noopHandle;
  return system.replaceToast(dedupeKey, next);
}

export function dismissToast(id: string): void {
  if (!browser) return;
  system.dismissToast(id);
}

export function pauseToast(id: string, reason: PauseReason): void {
  if (!browser) return;
  system.pauseToast(id, reason);
}

export function resumeToast(id: string, reason: PauseReason): void {
  if (!browser) return;
  system.resumeToast(id, reason);
}

export function clearToasts(): void {
  if (!browser) return;
  system.clearToasts();
}

type NamespaceFn = (message: string, opts?: Partial<ToastInput>) => ToastHandle;

const noopNamespace: NamespaceFn = () => noopHandle;

export const toast: {
  success: NamespaceFn;
  info: NamespaceFn;
  warning: NamespaceFn;
  error: NamespaceFn;
  loading: NamespaceFn;
} = browser
  ? system.toast
  : {
      success: noopNamespace,
      info: noopNamespace,
      warning: noopNamespace,
      error: noopNamespace,
      loading: noopNamespace,
    };
