import type { z } from 'zod';

export function formatZodError(err: z.ZodError): string {
  const first = err.errors[0];
  if (!first) return 'Validation error';
  const path = first.path;
  let location = '';
  if (Array.isArray(path) && path.length > 0) {
    const parts: string[] = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (typeof p === 'number') {
        if (path[i - 1] === 'rounds') parts.push(`Round ${p + 1}`);
        else if (path[i - 1] === 'questions') parts.push(`Question ${p + 1}`);
        else parts.push(String(p));
      } else if (typeof p === 'string' && !['rounds', 'questions'].includes(p)) {
        parts.push(p);
      }
    }
    location = parts.join(', ');
  }
  const msg = first.message;
  return location ? `${msg} (${location})` : msg;
}
