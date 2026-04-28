import type { AppConfig } from '$lib/server/config.js';
import { getPrizeEmailTransportValidationError, type PrizeEmailValidationInput } from '$lib/server/prizes/email.js';
import { hasPrizeEmailSmtpPassword } from '$lib/server/secrets.js';
import type { ParsedSettingsPutBody } from '$lib/server/settings/put-body.js';

export function getPrizeEmailValidationErrorForPut(parsed: ParsedSettingsPutBody, cfg: AppConfig): string | undefined {
  const nextPrizeEmailSmtpHost = parsed.prizeEmailSmtpHost !== undefined ? parsed.prizeEmailSmtpHost : (cfg.prizeEmailSmtpHost ?? '');
  const nextPrizeEmailSmtpPort = parsed.prizeEmailSmtpPort !== undefined ? parsed.prizeEmailSmtpPort : (cfg.prizeEmailSmtpPort ?? 587);
  const nextPrizeEmailSmtpUsername =
    parsed.prizeEmailSmtpUsername !== undefined ? parsed.prizeEmailSmtpUsername : (cfg.prizeEmailSmtpUsername ?? '');
  const nextPrizeEmailFromEmail = parsed.prizeEmailFromEmail !== undefined ? parsed.prizeEmailFromEmail : (cfg.prizeEmailFromEmail ?? '');
  const nextPrizeEmailFromName = parsed.prizeEmailFromName !== undefined ? parsed.prizeEmailFromName : (cfg.prizeEmailFromName ?? '');
  const nextPrizeEmailEnabled = parsed.prizeEmailEnabled !== undefined ? parsed.prizeEmailEnabled : (cfg.prizeEmailEnabled ?? false);
  const nextPrizeEmailSmtpPasswordConfigured = parsed.clearPrizeEmailSmtpPasswordFlag
    ? false
    : parsed.prizeEmailSmtpPassword !== undefined
      ? parsed.prizeEmailSmtpPassword.trim().length > 0
      : hasPrizeEmailSmtpPassword();

  const validationInput: PrizeEmailValidationInput = {
    host: nextPrizeEmailSmtpHost,
    port: nextPrizeEmailSmtpPort,
    username: nextPrizeEmailSmtpUsername,
    fromEmail: nextPrizeEmailFromEmail,
    fromName: nextPrizeEmailFromName,
    passwordConfigured: nextPrizeEmailSmtpPasswordConfigured,
  };
  return getPrizeEmailTransportValidationError(validationInput, { requirePassword: nextPrizeEmailEnabled });
}
