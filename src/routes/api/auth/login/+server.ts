import { json } from '@sveltejs/kit';
import { createSession, requireHostPassword, verifyPasswordConstantTime } from '$lib/server/auth/index.js';
import { checkLoginRateLimit } from '$lib/server/rate-limit.js';

export async function POST({ request, getClientAddress }) {
  if (!requireHostPassword()) {
    return json({ error: 'Authentication not configured' }, { status: 503 });
  }
  const clientAddress = getClientAddress();
  if (!checkLoginRateLimit(clientAddress)) {
    return json({ error: 'Too many attempts' }, { status: 429 });
  }
  try {
    const { password } = await request.json();
    const hostPassword = process.env.HOST_PASSWORD;
    if (!password || !hostPassword || !verifyPasswordConstantTime(password, hostPassword)) {
      console.warn(`[auth] Failed login attempt from ${clientAddress}`);
      return json({ error: 'Invalid password' }, { status: 401 });
    }
    const url = new URL(request.url);
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const isSecure =
      forwardedProto === 'https' || url.protocol === 'https:';
    const { cookie } = createSession({ secure: isSecure });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    });
  } catch {
    return json({ error: 'Invalid request' }, { status: 400 });
  }
}
