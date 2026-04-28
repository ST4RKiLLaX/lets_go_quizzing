import { validateRoomPrizeDefaultConfig } from '$lib/server/prizes/service.js';

export type ParsedSettingsPutBody = {
  currentPassword: string;
  newUsername: string | undefined;
  newPassword: string | undefined;
  newPasswordConfirm: string | undefined;
  origin: string | undefined;
  roomIdLen: number | undefined;
  profanityFilterMode: string | undefined;
  customKeywordFilterEnabled: boolean | undefined;
  customBlockedTermsRaw: unknown[] | undefined;
  prizesEnabled: boolean | undefined;
  prizeEmailEnabled: boolean | undefined;
  prizeEmailSmtpHost: string | undefined;
  prizeEmailSmtpPort: number | undefined;
  prizeEmailSmtpSecure: boolean | undefined;
  prizeEmailSmtpUsername: string | undefined;
  prizeEmailFromEmail: string | undefined;
  prizeEmailFromName: string | undefined;
  prizeEmailSmtpPassword: string | undefined;
  clearPrizeEmailSmtpPasswordFlag: boolean;
  defaultRoomPrizeConfig: ReturnType<typeof validateRoomPrizeDefaultConfig> | undefined;
  defaultRoomPrizeConfigWasNull: boolean;
};

export function parseSettingsPutBody(body: unknown): ParsedSettingsPutBody {
  const input = (body ?? {}) as Record<string, unknown>;
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newUsername = typeof input.username === 'string' ? input.username.trim() : undefined;
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : undefined;
  const newPasswordConfirm = typeof input.newPasswordConfirm === 'string' ? input.newPasswordConfirm : undefined;
  const origin = input.origin !== undefined ? (typeof input.origin === 'string' ? input.origin.trim() : '') : undefined;
  const roomIdLen = input.roomIdLen !== undefined ? Number(input.roomIdLen) : undefined;
  const profanityFilterMode =
    input.profanityFilterMode !== undefined ? (typeof input.profanityFilterMode === 'string' ? input.profanityFilterMode : undefined) : undefined;
  const customKeywordFilterEnabled =
    input.customKeywordFilterEnabled !== undefined
      ? typeof input.customKeywordFilterEnabled === 'boolean'
        ? input.customKeywordFilterEnabled
        : undefined
      : undefined;
  const customBlockedTermsRaw =
    input.customBlockedTerms !== undefined ? (Array.isArray(input.customBlockedTerms) ? input.customBlockedTerms : undefined) : undefined;
  const prizesEnabled = input.prizesEnabled !== undefined ? (typeof input.prizesEnabled === 'boolean' ? input.prizesEnabled : undefined) : undefined;
  const prizeEmailEnabled =
    input.prizeEmailEnabled !== undefined ? (typeof input.prizeEmailEnabled === 'boolean' ? input.prizeEmailEnabled : undefined) : undefined;
  const prizeEmailSmtpHost =
    input.prizeEmailSmtpHost !== undefined ? (typeof input.prizeEmailSmtpHost === 'string' ? input.prizeEmailSmtpHost.trim() : undefined) : undefined;
  const prizeEmailSmtpPort = input.prizeEmailSmtpPort !== undefined ? Number(input.prizeEmailSmtpPort) : undefined;
  const prizeEmailSmtpSecure =
    input.prizeEmailSmtpSecure !== undefined
      ? typeof input.prizeEmailSmtpSecure === 'boolean'
        ? input.prizeEmailSmtpSecure
        : undefined
      : undefined;
  const prizeEmailSmtpUsername =
    input.prizeEmailSmtpUsername !== undefined
      ? typeof input.prizeEmailSmtpUsername === 'string'
        ? input.prizeEmailSmtpUsername.trim()
        : undefined
      : undefined;
  const prizeEmailFromEmail =
    input.prizeEmailFromEmail !== undefined
      ? typeof input.prizeEmailFromEmail === 'string'
        ? input.prizeEmailFromEmail.trim()
        : undefined
      : undefined;
  const prizeEmailFromName =
    input.prizeEmailFromName !== undefined
      ? typeof input.prizeEmailFromName === 'string'
        ? input.prizeEmailFromName.trim()
        : undefined
      : undefined;
  const prizeEmailSmtpPassword =
    input.prizeEmailSmtpPassword !== undefined
      ? typeof input.prizeEmailSmtpPassword === 'string'
        ? input.prizeEmailSmtpPassword
        : undefined
      : undefined;
  const clearPrizeEmailSmtpPasswordFlag = input.clearPrizeEmailSmtpPassword !== undefined ? input.clearPrizeEmailSmtpPassword === true : false;
  const defaultRoomPrizeConfig = input.defaultRoomPrizeConfig !== undefined ? validateRoomPrizeDefaultConfig(input.defaultRoomPrizeConfig) : undefined;
  const defaultRoomPrizeConfigWasNull = input.defaultRoomPrizeConfig === null;

  return {
    currentPassword,
    newUsername,
    newPassword,
    newPasswordConfirm,
    origin,
    roomIdLen,
    profanityFilterMode,
    customKeywordFilterEnabled,
    customBlockedTermsRaw,
    prizesEnabled,
    prizeEmailEnabled,
    prizeEmailSmtpHost,
    prizeEmailSmtpPort,
    prizeEmailSmtpSecure,
    prizeEmailSmtpUsername,
    prizeEmailFromEmail,
    prizeEmailFromName,
    prizeEmailSmtpPassword,
    clearPrizeEmailSmtpPasswordFlag,
    defaultRoomPrizeConfig,
    defaultRoomPrizeConfigWasNull,
  };
}
