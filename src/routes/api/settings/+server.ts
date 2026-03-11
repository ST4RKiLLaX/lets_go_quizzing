import { json } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth/index.js';
import {
  loadConfig,
  saveConfig,
  hashPassword,
  verifyPassword,
  getEffectiveOrigin,
  getEffectiveRoomIdLen,
} from '$lib/server/config.js';
import { createSession, getCurrentAuthEpoch } from '$lib/server/auth/index.js';

export async function GET({ request }) {
  const cookie = request.headers.get('cookie');
  if (!isAuthenticated(cookie ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const cfg = loadConfig();
  if (!cfg) {
    return json({ error: 'Config not found' }, { status: 404 });
  }
  const envOverrides = {
    origin: !!process.env.ORIGIN,
    roomIdLen: process.env.ROOM_ID_LEN != null,
  };
  return json({
    username: cfg.adminUsername,
    origin: cfg.origin ?? '',
    roomIdLen: cfg.roomIdLen ?? 6,
    effectiveOrigin: getEffectiveOrigin() ?? '',
    effectiveRoomIdLen: getEffectiveRoomIdLen(),
    envOverrides,
  });
}

export async function PUT({ request }) {
  const cookie = request.headers.get('cookie');
  if (!isAuthenticated(cookie ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const cfg = loadConfig();
  if (!cfg) {
    return json({ error: 'Config not found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newUsername = typeof body?.username === 'string' ? body.username.trim() : undefined;
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : undefined;
    const newPasswordConfirm =
      typeof body?.newPasswordConfirm === 'string' ? body.newPasswordConfirm : undefined;
    const origin = body?.origin !== undefined ? (typeof body.origin === 'string' ? body.origin.trim() : '') : undefined;
    const roomIdLen = body?.roomIdLen !== undefined ? Number(body.roomIdLen) : undefined;

    const changingCredentials = newUsername !== undefined || newPassword !== undefined;
    if (changingCredentials && !verifyPassword(currentPassword, cfg.adminPasswordHash)) {
      return json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    if (newUsername !== undefined) {
      if (newUsername.length < 3 || newUsername.length > 50) {
        return json({ error: 'Username must be 3–50 characters' }, { status: 400 });
      }
    }
    if (newPassword !== undefined) {
      if (newPassword.length < 8) {
        return json({ error: 'New password must be at least 8 characters' }, { status: 400 });
      }
      if (newPassword !== newPasswordConfirm) {
        return json({ error: 'New passwords do not match' }, { status: 400 });
      }
    }
    if (roomIdLen !== undefined && (roomIdLen < 4 || roomIdLen > 12 || !Number.isInteger(roomIdLen))) {
      return json({ error: 'Room ID length must be 4–12' }, { status: 400 });
    }

    const partial: Parameters<typeof saveConfig>[0] = {};
    if (newUsername !== undefined) partial.adminUsername = newUsername;
    if (newPassword !== undefined) partial.adminPasswordHash = hashPassword(newPassword);
    if (origin !== undefined) partial.origin = origin || undefined;
    if (roomIdLen !== undefined) partial.roomIdLen = roomIdLen;

    if (changingCredentials) {
      partial.authEpoch = (cfg.authEpoch ?? 0) + 1;
    }

    if (Object.keys(partial).length > 0) {
      saveConfig(partial);
    }

    if (changingCredentials) {
      const url = new URL(request.url);
      const forwardedProto = request.headers.get('x-forwarded-proto');
      const isSecure = forwardedProto === 'https' || url.protocol === 'https:';
      const { cookie: newCookie } = createSession({
        secure: isSecure,
        authEpoch: getCurrentAuthEpoch(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': newCookie,
        },
      });
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[settings] Error:', e);
    return json({ error: 'Update failed' }, { status: 500 });
  }
}
