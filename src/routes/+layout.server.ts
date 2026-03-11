import { isAuthenticated, requireHostAuth } from '$lib/server/auth.js';

export async function load({ request }) {
  const authRequired = requireHostAuth();
  const authenticated = authRequired && isAuthenticated(request.headers.get('cookie') ?? undefined);
  return { hostAuthenticated: authenticated };
}
