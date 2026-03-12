import { json } from '@sveltejs/kit';
import { createSession, requireHostAuth, verifyWithEnvOrConfig, getCurrentAuthEpoch } from '$lib/server/auth.js';
import { jsonWithCookie } from '$lib/server/response.js';
import { checkLoginRateLimit } from '$lib/server/rate-limit.js';

export async function POST({ request, getClientAddress }) {
  if (!requireHostAuth()) {
    return json({ error: 'Authentication not configured' }, { status: 503 });
  }
  const clientAddress = getClientAddress();
  if (!checkLoginRateLimit(clientAddress)) {
    return json({ error: 'Too many attempts' }, { status: 429 });
  }
  try {
    const { username, password } = await request.json();
    if (!password || typeof password !== 'string') {
      return json({ error: 'Invalid request' }, { status: 400 });
    }
    const u = typeof username === 'string' ? username.trim() : '';
    if (!verifyWithEnvOrConfig(u, password)) {
      console.warn(`[auth] Failed login attempt from ${clientAddress}`);
      return json({ error: 'Invalid password' }, { status: 401 });
    }
    const url = new URL(request.url);
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const isSecure = forwardedProto === 'https' || url.protocol === 'https:';
    const { cookie } = createSession({ secure: isSecure, authEpoch: getCurrentAuthEpoch() });
    return jsonWithCookie({ ok: true }, cookie);
  } catch {
    return json({ error: 'Invalid request' }, { status: 400 });
  }
}
