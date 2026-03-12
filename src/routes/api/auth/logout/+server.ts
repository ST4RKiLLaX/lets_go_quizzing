import { createLogoutCookie } from '$lib/server/auth.js';
import { jsonWithCookie } from '$lib/server/response.js';

export async function POST({ request }) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isSecure = forwardedProto === 'https' || url.protocol === 'https:';
  const cookie = createLogoutCookie(isSecure);
  return jsonWithCookie({ ok: true }, cookie);
}
