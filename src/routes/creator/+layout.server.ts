import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';

export async function load({ request }) {
  const required = requireHostPassword();
  const authenticated = required && isAuthenticated(request.headers.get('cookie') ?? undefined);
  return { authRequired: required, authenticated };
}
