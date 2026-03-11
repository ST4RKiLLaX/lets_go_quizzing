import { redirect } from '@sveltejs/kit';
import { isAuthenticated, requireHostAuth } from '$lib/server/auth.js';

export async function load({ request }) {
  if (!requireHostAuth()) {
    throw redirect(303, '/');
  }
  const cookie = request.headers.get('cookie');
  if (!isAuthenticated(cookie ?? undefined)) {
    throw redirect(303, '/');
  }
  return {};
}
