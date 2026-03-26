import { json } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth.js';
import {
  loadConfig,
  saveConfig,
  hashPassword,
  verifyPassword,
  getEffectiveOrigin,
  getEffectiveRoomIdLen,
  type ProfanityFilterMode,
} from '$lib/server/config.js';
import { createSession, getCurrentAuthEpoch } from '$lib/server/auth.js';
import { resetCustomBlockCache } from '$lib/server/custom-block.js';
import { jsonWithCookie } from '$lib/server/response.js';
import { validateRoomPrizeDefaultConfig } from '$lib/server/prizes/service.js';

const CUSTOM_BLOCK_MAX_TERMS = 100;
const CUSTOM_BLOCK_MAX_TERM_LENGTH = 50;

function normalizeForDedupe(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
    .trim();
}

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
    profanityFilterMode: cfg.profanityFilterMode ?? 'off',
    customKeywordFilterEnabled: cfg.customKeywordFilterEnabled ?? false,
    customBlockedTerms: cfg.customBlockedTerms ?? [],
    prizesEnabled: cfg.prizesEnabled ?? false,
    prizeEmailEnabled: cfg.prizeEmailEnabled ?? false,
    defaultRoomPrizeConfig: cfg.defaultRoomPrizeConfig ?? null,
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
    const newPasswordConfirm = typeof body?.newPasswordConfirm === 'string' ? body.newPasswordConfirm : undefined;
    const origin = body?.origin !== undefined ? (typeof body.origin === 'string' ? body.origin.trim() : '') : undefined;
    const roomIdLen = body?.roomIdLen !== undefined ? Number(body.roomIdLen) : undefined;
    const profanityFilterMode =
      body?.profanityFilterMode !== undefined
        ? typeof body.profanityFilterMode === 'string'
          ? body.profanityFilterMode
          : undefined
        : undefined;
    const customKeywordFilterEnabled =
      body?.customKeywordFilterEnabled !== undefined
        ? typeof body.customKeywordFilterEnabled === 'boolean'
          ? body.customKeywordFilterEnabled
          : undefined
        : undefined;
    const customBlockedTermsRaw =
      body?.customBlockedTerms !== undefined
        ? Array.isArray(body.customBlockedTerms)
          ? body.customBlockedTerms
          : undefined
        : undefined;
    const prizesEnabled =
      body?.prizesEnabled !== undefined ? (typeof body.prizesEnabled === 'boolean' ? body.prizesEnabled : undefined) : undefined;
    const prizeEmailEnabled =
      body?.prizeEmailEnabled !== undefined
        ? typeof body.prizeEmailEnabled === 'boolean'
          ? body.prizeEmailEnabled
          : undefined
        : undefined;
    const defaultRoomPrizeConfig =
      body?.defaultRoomPrizeConfig !== undefined ? validateRoomPrizeDefaultConfig(body.defaultRoomPrizeConfig) : undefined;

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
    const validModes: ProfanityFilterMode[] = ['off', 'names', 'public_text', 'strict'];
    if (profanityFilterMode !== undefined && !validModes.includes(profanityFilterMode as ProfanityFilterMode)) {
      return json({ error: 'Invalid profanity filter mode' }, { status: 400 });
    }

    let customBlockedTerms: string[] | undefined;
    if (customBlockedTermsRaw !== undefined) {
      const trimmed = customBlockedTermsRaw
        .map((t: unknown) => (typeof t === 'string' ? t.trim() : ''))
        .filter((t: string) => t.length > 0);
      const normalizedSeen = new Set<string>();
      const deduped: string[] = [];
      for (const t of trimmed) {
        const capped = t.length > CUSTOM_BLOCK_MAX_TERM_LENGTH ? t.slice(0, CUSTOM_BLOCK_MAX_TERM_LENGTH) : t;
        const n = normalizeForDedupe(capped);
        if (n && !normalizedSeen.has(n)) {
          normalizedSeen.add(n);
          deduped.push(capped);
        }
      }
      customBlockedTerms = deduped.slice(0, CUSTOM_BLOCK_MAX_TERMS);
    }

    const partial: Parameters<typeof saveConfig>[0] = {};
    if (newUsername !== undefined) partial.adminUsername = newUsername;
    if (newPassword !== undefined) partial.adminPasswordHash = hashPassword(newPassword);
    if (origin !== undefined) partial.origin = origin || undefined;
    if (roomIdLen !== undefined) partial.roomIdLen = roomIdLen;
    if (profanityFilterMode !== undefined) partial.profanityFilterMode = profanityFilterMode as ProfanityFilterMode;
    if (customKeywordFilterEnabled !== undefined) partial.customKeywordFilterEnabled = customKeywordFilterEnabled;
    if (customBlockedTerms !== undefined) partial.customBlockedTerms = customBlockedTerms;
    if (prizesEnabled !== undefined) partial.prizesEnabled = prizesEnabled;
    if (prizeEmailEnabled !== undefined) partial.prizeEmailEnabled = prizeEmailEnabled;
    if (defaultRoomPrizeConfig !== undefined || body?.defaultRoomPrizeConfig === null) {
      partial.defaultRoomPrizeConfig = body?.defaultRoomPrizeConfig === null ? undefined : defaultRoomPrizeConfig;
    }

    if (changingCredentials) {
      partial.authEpoch = (cfg.authEpoch ?? 0) + 1;
    }

    if (Object.keys(partial).length > 0) {
      saveConfig(partial);
      if (partial.customKeywordFilterEnabled !== undefined || partial.customBlockedTerms !== undefined) {
        resetCustomBlockCache();
      }
    }

    if (changingCredentials) {
      const url = new URL(request.url);
      const forwardedProto = request.headers.get('x-forwarded-proto');
      const isSecure = forwardedProto === 'https' || url.protocol === 'https:';
      const { cookie: newCookie } = createSession({
        secure: isSecure,
        authEpoch: getCurrentAuthEpoch(),
      });
      return jsonWithCookie({ ok: true }, newCookie);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[settings] Error:', e);
    return json({ error: 'Update failed' }, { status: 500 });
  }
}
