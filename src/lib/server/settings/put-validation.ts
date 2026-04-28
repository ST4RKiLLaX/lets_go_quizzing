import type { AppConfig, ProfanityFilterMode } from '$lib/server/config.js';
import { verifyPassword } from '$lib/server/config.js';
import { isValidEmailAddress, isValidSmtpPort } from '$lib/server/prizes/email.js';
import type { ParsedSettingsPutBody } from '$lib/server/settings/put-body.js';

export type SettingsValidationError = {
  status: number;
  error: string;
};

export function validateSettingsPut(parsed: ParsedSettingsPutBody, cfg: AppConfig): SettingsValidationError | null {
  const changingCredentials = parsed.newUsername !== undefined || parsed.newPassword !== undefined;
  if (changingCredentials && !verifyPassword(parsed.currentPassword, cfg.adminPasswordHash)) {
    return { status: 401, error: 'Current password is incorrect' };
  }

  if (parsed.newUsername !== undefined) {
    if (parsed.newUsername.length < 3 || parsed.newUsername.length > 50) {
      return { status: 400, error: 'Username must be 3–50 characters' };
    }
  }
  if (parsed.newPassword !== undefined) {
    if (parsed.newPassword.length < 8) {
      return { status: 400, error: 'New password must be at least 8 characters' };
    }
    if (parsed.newPassword !== parsed.newPasswordConfirm) {
      return { status: 400, error: 'New passwords do not match' };
    }
  }
  if (parsed.roomIdLen !== undefined && (parsed.roomIdLen < 4 || parsed.roomIdLen > 12 || !Number.isInteger(parsed.roomIdLen))) {
    return { status: 400, error: 'Room ID length must be 4–12' };
  }
  if (parsed.prizeEmailSmtpPort !== undefined && !isValidSmtpPort(parsed.prizeEmailSmtpPort)) {
    return { status: 400, error: 'SMTP port must be 1–65535' };
  }
  const validModes: ProfanityFilterMode[] = ['off', 'names', 'public_text', 'strict'];
  if (parsed.profanityFilterMode !== undefined && !validModes.includes(parsed.profanityFilterMode as ProfanityFilterMode)) {
    return { status: 400, error: 'Invalid profanity filter mode' };
  }
  if (parsed.prizeEmailFromEmail !== undefined && parsed.prizeEmailFromEmail && !isValidEmailAddress(parsed.prizeEmailFromEmail)) {
    return { status: 400, error: 'Enter a valid SMTP from email address' };
  }
  if (parsed.clearPrizeEmailSmtpPasswordFlag && parsed.prizeEmailSmtpPassword && parsed.prizeEmailSmtpPassword.trim()) {
    return { status: 400, error: 'Choose either replace password or clear password' };
  }
  return null;
}
