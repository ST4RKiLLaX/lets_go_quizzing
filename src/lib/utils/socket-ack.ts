import { toast } from '$lib/stores/toasts.js';

export interface SocketErrorAck {
  ok?: boolean;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Callback factory for socket.emit ack handlers that should surface errors as toasts.
 *
 * Treat an undefined ack payload as "no ack channel", NOT a failure. Only toast when
 * the server explicitly signals failure via `ack.ok === false` or an `error` string.
 */
export function ackToast(
  fallbackMessage: string,
  onSuccess?: (ack: SocketErrorAck) => void
): (ack?: SocketErrorAck) => void {
  return (ack) => {
    if (!ack) return;
    const explicitFailure = ack.ok === false || typeof ack.error === 'string';
    if (explicitFailure) {
      const text = ack.error ?? ack.message ?? ack.code ?? fallbackMessage;
      toast.error(text);
      return;
    }
    onSuccess?.(ack);
  };
}
