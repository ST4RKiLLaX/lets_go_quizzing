import { json } from '@sveltejs/kit';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';

export async function GET({ request }) {
  const cookie = request.headers.get('cookie');
  const required = requireHostPassword();
  const authenticated = required && isAuthenticated(cookie ?? undefined);
  return json({ required, authenticated });
}
