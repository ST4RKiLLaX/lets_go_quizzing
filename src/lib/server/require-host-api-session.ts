import { json } from '@sveltejs/kit';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';

export function requireHostApiSession(request: Request): Response | null {
  if (!requireHostPassword()) {
    return json({ error: 'Hosting disabled' }, { status: 503 });
  }
  if (!isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
