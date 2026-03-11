import { createLogoutCookie } from '$lib/server/auth/index.js';

export async function POST({ request }) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isSecure = forwardedProto === 'https' || url.protocol === 'https:';
  const cookie = createLogoutCookie(isSecure);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}
