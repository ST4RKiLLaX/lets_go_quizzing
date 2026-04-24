import { json } from '@sveltejs/kit';

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function jsonError(status: number, message: string, code?: string): Response {
  if (code) {
    return json({ error: message, code }, { status });
  }
  return json({ error: message }, { status });
}
