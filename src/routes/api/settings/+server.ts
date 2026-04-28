import { json } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth.js';
import {
  loadConfig,
  saveConfig,
  getEffectiveOrigin,
  getEffectiveRoomIdLen,
} from '$lib/server/config.js';
import { createSession, getCurrentAuthEpoch } from '$lib/server/auth.js';
import { resetCustomBlockCache } from '$lib/server/custom-block.js';
import {
  clearPrizeEmailSmtpPassword,
  hasPrizeEmailSmtpPassword,
  setPrizeEmailSmtpPassword,
} from '$lib/server/secrets.js';
import {
  getPrizeEmailStatus,
} from '$lib/server/prizes/email.js';
import { jsonWithCookie } from '$lib/server/response.js';
import { dedupeAndCapCustomBlockedTerms } from '$lib/server/settings/custom-blocked-terms.js';
import { buildSettingsConfigPartial } from '$lib/server/settings/put-config-partial.js';
import { parseSettingsPutBody } from '$lib/server/settings/put-body.js';
import { getPrizeEmailValidationErrorForPut } from '$lib/server/settings/prize-email-put-preview.js';
import { validateSettingsPut } from '$lib/server/settings/put-validation.js';

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
  const prizeEmailStatus = getPrizeEmailStatus(cfg);
  return json({
    username: cfg.adminUsername,
    origin: cfg.origin ?? '',
    roomIdLen: cfg.roomIdLen ?? 6,
    profanityFilterMode: cfg.profanityFilterMode ?? 'off',
    customKeywordFilterEnabled: cfg.customKeywordFilterEnabled ?? false,
    customBlockedTerms: cfg.customBlockedTerms ?? [],
    prizesEnabled: cfg.prizesEnabled ?? false,
    prizeEmailEnabled: cfg.prizeEmailEnabled ?? false,
    prizeEmailSmtpHost: cfg.prizeEmailSmtpHost ?? '',
    prizeEmailSmtpPort: cfg.prizeEmailSmtpPort ?? 587,
    prizeEmailSmtpSecure: cfg.prizeEmailSmtpSecure ?? false,
    prizeEmailSmtpUsername: cfg.prizeEmailSmtpUsername ?? '',
    prizeEmailFromEmail: cfg.prizeEmailFromEmail ?? '',
    prizeEmailFromName: cfg.prizeEmailFromName ?? '',
    prizeEmailSmtpPasswordConfigured: hasPrizeEmailSmtpPassword(),
    prizeEmailAvailableNow: prizeEmailStatus.availableNow,
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
    const parsed = parseSettingsPutBody(await request.json());

    const validationError = validateSettingsPut(parsed, cfg);
    if (validationError) {
      return json({ error: validationError.error }, { status: validationError.status });
    }

    const customBlockedTerms =
      parsed.customBlockedTermsRaw !== undefined ? dedupeAndCapCustomBlockedTerms(parsed.customBlockedTermsRaw) : undefined;

    const prizeEmailValidationError = getPrizeEmailValidationErrorForPut(parsed, cfg);
    if (prizeEmailValidationError) {
      return json({ error: prizeEmailValidationError }, { status: 400 });
    }

    const partial = buildSettingsConfigPartial(parsed, cfg, customBlockedTerms);

    if (Object.keys(partial).length > 0) {
      saveConfig(partial);
      if (partial.customKeywordFilterEnabled !== undefined || partial.customBlockedTerms !== undefined) {
        resetCustomBlockCache();
      }
    }
    if (parsed.clearPrizeEmailSmtpPasswordFlag) {
      clearPrizeEmailSmtpPassword();
    } else if (parsed.prizeEmailSmtpPassword !== undefined && parsed.prizeEmailSmtpPassword.trim()) {
      setPrizeEmailSmtpPassword(parsed.prizeEmailSmtpPassword);
    }

    const changingCredentials = parsed.newUsername !== undefined || parsed.newPassword !== undefined;
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
