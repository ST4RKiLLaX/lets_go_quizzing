import { hashPassword, type AppConfig, type ProfanityFilterMode, saveConfig } from '$lib/server/config.js';
import type { ParsedSettingsPutBody } from '$lib/server/settings/put-body.js';

export function buildSettingsConfigPartial(
  parsed: ParsedSettingsPutBody,
  cfg: AppConfig,
  customBlockedTerms: string[] | undefined
): Parameters<typeof saveConfig>[0] {
  const partial: Parameters<typeof saveConfig>[0] = {};
  if (parsed.newUsername !== undefined) partial.adminUsername = parsed.newUsername;
  if (parsed.newPassword !== undefined) partial.adminPasswordHash = hashPassword(parsed.newPassword);
  if (parsed.origin !== undefined) partial.origin = parsed.origin || undefined;
  if (parsed.roomIdLen !== undefined) partial.roomIdLen = parsed.roomIdLen;
  if (parsed.profanityFilterMode !== undefined) partial.profanityFilterMode = parsed.profanityFilterMode as ProfanityFilterMode;
  if (parsed.customKeywordFilterEnabled !== undefined) partial.customKeywordFilterEnabled = parsed.customKeywordFilterEnabled;
  if (customBlockedTerms !== undefined) partial.customBlockedTerms = customBlockedTerms;
  if (parsed.prizesEnabled !== undefined) partial.prizesEnabled = parsed.prizesEnabled;
  if (parsed.prizeEmailEnabled !== undefined) partial.prizeEmailEnabled = parsed.prizeEmailEnabled;
  if (parsed.prizeEmailSmtpHost !== undefined) partial.prizeEmailSmtpHost = parsed.prizeEmailSmtpHost || undefined;
  if (parsed.prizeEmailSmtpPort !== undefined) partial.prizeEmailSmtpPort = parsed.prizeEmailSmtpPort;
  if (parsed.prizeEmailSmtpSecure !== undefined) partial.prizeEmailSmtpSecure = parsed.prizeEmailSmtpSecure;
  if (parsed.prizeEmailSmtpUsername !== undefined) partial.prizeEmailSmtpUsername = parsed.prizeEmailSmtpUsername || undefined;
  if (parsed.prizeEmailFromEmail !== undefined) partial.prizeEmailFromEmail = parsed.prizeEmailFromEmail || undefined;
  if (parsed.prizeEmailFromName !== undefined) partial.prizeEmailFromName = parsed.prizeEmailFromName || undefined;
  if (parsed.defaultRoomPrizeConfig !== undefined || parsed.defaultRoomPrizeConfigWasNull) {
    partial.defaultRoomPrizeConfig = parsed.defaultRoomPrizeConfigWasNull ? undefined : parsed.defaultRoomPrizeConfig;
  }

  const changingCredentials = parsed.newUsername !== undefined || parsed.newPassword !== undefined;
  if (changingCredentials) {
    partial.authEpoch = (cfg.authEpoch ?? 0) + 1;
  }

  return partial;
}
