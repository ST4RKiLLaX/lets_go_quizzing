import { json } from '@sveltejs/kit';
import {
  hasValidOperationalConfig,
  createConfigAtomic,
  hashPassword,
} from '$lib/server/config.js';
import { createSession, getCurrentAuthEpoch } from '$lib/server/auth/index.js';
import { checkSetupRateLimit } from '$lib/server/rate-limit.js';

const RECOVERY_MODE = process.env.RECOVERY_MODE === 'true' || process.env.RECOVERY_MODE === '1';

export async function POST({ request, getClientAddress }) {
  if (hasValidOperationalConfig() && !RECOVERY_MODE) {
    return json({ error: 'Setup already completed' }, { status: 403 });
  }
  const clientAddress = getClientAddress();
  if (!checkSetupRateLimit(clientAddress)) {
    return json({ error: 'Too many attempts' }, { status: 429 });
  }
  try {
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const passwordConfirm = typeof body?.passwordConfirm === 'string' ? body.passwordConfirm : '';
    const origin = typeof body?.origin === 'string' ? body.origin.trim() : undefined;
    const roomIdLen = body?.roomIdLen != null ? Number(body.roomIdLen) : undefined;

    if (username.length < 3 || username.length > 50) {
      return json({ error: 'Username must be 3–50 characters' }, { status: 400 });
    }
    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (password !== passwordConfirm) {
      return json({ error: 'Passwords do not match' }, { status: 400 });
    }
    if (roomIdLen != null && (roomIdLen < 4 || roomIdLen > 12 || !Number.isInteger(roomIdLen))) {
      return json({ error: 'Room ID length must be 4–12' }, { status: 400 });
    }

    const config = {
      adminUsername: username,
      adminPasswordHash: hashPassword(password),
      origin: origin || undefined,
      roomIdLen: roomIdLen ?? 6,
    };

    const created = createConfigAtomic(config);
    if (!created) {
      return json({ error: 'Setup already completed by another request' }, { status: 409 });
    }

    const url = new URL(request.url);
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const isSecure = forwardedProto === 'https' || url.protocol === 'https:';
    const { cookie } = createSession({ secure: isSecure, authEpoch: getCurrentAuthEpoch() });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    });
  } catch (e) {
    console.error('[setup] Error:', e);
    return json({ error: 'Setup failed' }, { status: 500 });
  }
}
