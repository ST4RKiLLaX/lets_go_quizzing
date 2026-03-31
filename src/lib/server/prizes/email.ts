import nodemailer from 'nodemailer';
import type { AppConfig } from '../config.js';
import { getPrizeEmailSmtpPassword } from '../secrets.js';

export interface PrizeEmailTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
}

export interface PrizeEmailStatus {
  featureEnabled: boolean;
  transportConfigured: boolean;
  availableNow: boolean;
}

export interface PrizeEmailValidationInput {
  host?: string;
  port?: number;
  username?: string;
  fromEmail?: string;
  fromName?: string;
  passwordConfigured: boolean;
}

export interface PrizeEmailTemplateInput {
  prizes: Array<{
    prizeName: string;
    prizeUrl: string;
  }>;
}

export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidSmtpPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function isPrizeEmailFeatureEnabled(config: AppConfig | null | undefined): boolean {
  return config?.prizesEnabled === true && config?.prizeEmailEnabled === true;
}

export function hasAnyPrizeEmailTransportInput(input: PrizeEmailValidationInput): boolean {
  return !!(input.host || input.username || input.fromEmail || input.fromName || input.passwordConfigured);
}

export function getPrizeEmailTransportValidationError(
  input: PrizeEmailValidationInput,
  options: { requirePassword: boolean }
): string | undefined {
  if (!hasAnyPrizeEmailTransportInput(input) && !options.requirePassword) {
    return undefined;
  }

  if (!input.host) {
    return 'SMTP host is required';
  }
  if (!isValidSmtpPort(input.port)) {
    return 'SMTP port must be 1–65535';
  }
  if (!input.username) {
    return 'SMTP username is required';
  }
  if (!input.fromEmail || !isValidEmailAddress(input.fromEmail)) {
    return 'A valid SMTP from email is required';
  }
  if (options.requirePassword && !input.passwordConfigured) {
    return 'SMTP password is required';
  }

  return undefined;
}

export function getPrizeEmailTransportConfig(config: AppConfig | null | undefined): PrizeEmailTransportConfig | undefined {
  const host = config?.prizeEmailSmtpHost?.trim();
  const port = config?.prizeEmailSmtpPort;
  const secure = config?.prizeEmailSmtpSecure === true;
  const username = config?.prizeEmailSmtpUsername?.trim();
  const password = getPrizeEmailSmtpPassword();
  const fromEmail = config?.prizeEmailFromEmail?.trim();
  const fromName = config?.prizeEmailFromName?.trim() || undefined;

  if (!host || !isValidSmtpPort(port) || !username || !password || !fromEmail || !isValidEmailAddress(fromEmail)) {
    return undefined;
  }

  return {
    host,
    port,
    secure,
    username,
    password,
    fromEmail,
    fromName,
  };
}

export function getPrizeEmailStatus(config: AppConfig | null | undefined): PrizeEmailStatus {
  const featureEnabled = isPrizeEmailFeatureEnabled(config);
  const transportConfigured = !!getPrizeEmailTransportConfig(config);
  return {
    featureEnabled,
    transportConfigured,
    availableNow: featureEnabled && transportConfigured,
  };
}

export function buildPrizeEmailFrom(config: PrizeEmailTransportConfig): string {
  const fromName = config.fromName?.trim();
  if (!fromName) return config.fromEmail;
  return `${fromName} <${config.fromEmail}>`;
}

export function createPrizeEmailTransporter(config: AppConfig | null | undefined) {
  const transportConfig = getPrizeEmailTransportConfig(config);
  if (!transportConfig) {
    throw new Error('Prize email transport is not configured');
  }

  return nodemailer.createTransport({
    host: transportConfig.host,
    port: transportConfig.port,
    secure: transportConfig.secure,
    auth: {
      user: transportConfig.username,
      pass: transportConfig.password,
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildPrizeEmailText(input: PrizeEmailTemplateInput): string {
  const prizeLines = input.prizes.flatMap((prize, index) => [
    `${index + 1}. ${prize.prizeName}`,
    prize.prizeUrl,
    '',
  ]);
  return [
    input.prizes.length === 1 ? `You unlocked ${input.prizes[0].prizeName}.` : 'You unlocked multiple prizes.',
    '',
    input.prizes.length === 1 ? 'Prize link:' : 'Prize links:',
    ...prizeLines,
    '',
    'Please contact the quiz host for more information.',
    '',
    "Let's Go Quizzing and the app maker are not responsible for prize delivery.",
  ].join('\n');
}

export function buildPrizeEmailHtml(input: PrizeEmailTemplateInput): string {
  const isSinglePrize = input.prizes.length === 1;
  const intro =
    isSinglePrize
      ? `You unlocked <strong style="color:#fbbf24;">${escapeHtml(input.prizes[0].prizeName)}</strong>.`
      : `You unlocked <strong style="color:#fbbf24;">${input.prizes.length} prizes</strong>.`;
  const primaryPrizeUrl = escapeHtml(input.prizes[0]?.prizeUrl ?? '');
  const prizeCards = input.prizes
    .map((prize, index) => {
      const prizeName = escapeHtml(prize.prizeName);
      const prizeUrl = escapeHtml(prize.prizeUrl);
      return `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#111827;border:1px solid #4b5563;margin-top:${index === 0 ? '0' : '12'}px;">
                  <tr>
                    <td style="padding:16px;">
                      <div style="font-family:Arial,sans-serif;font-size:12px;line-height:16px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#fbbf24;">
                        Prize ${index + 1}
                      </div>
                      <div style="padding-top:8px;font-family:Arial,sans-serif;font-size:16px;line-height:24px;font-weight:700;color:#f9fafb;">
                        ${prizeName}
                      </div>
                      <div style="padding-top:8px;font-family:Arial,sans-serif;font-size:14px;line-height:22px;">
                        <a href="${prizeUrl}" style="color:#fbbf24;text-decoration:none;word-break:break-all;word-wrap:break-word;">
                          ${prizeUrl}
                        </a>
                      </div>
                      ${isSinglePrize ? '' : `
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:14px;">
                        <tr>
                          <td bgcolor="#f59e0b" style="background-color:#f59e0b;">
                            <a
                              href="${prizeUrl}"
                              style="display:inline-block;padding:12px 16px;font-family:Arial,sans-serif;font-size:15px;line-height:15px;font-weight:700;color:#111827;text-decoration:none;background-color:#f59e0b;"
                            >
                              Open Prize Link
                            </a>
                          </td>
                        </tr>
                      </table>`}
                    </td>
                  </tr>
                </table>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Prize Unlocked</title>
  </head>
  <body style="margin:0;padding:0;background-color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#111827;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;border-collapse:collapse;background-color:#1f2937;border:1px solid #374151;">
            <tr>
              <td style="padding:24px 24px 16px;border-bottom:1px solid #374151;background-color:#1f2937;">
                <div style="font-family:Arial,sans-serif;font-size:13px;line-height:18px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">
                  Let's Go Quizzing
                </div>
                <div style="padding-top:10px;font-family:Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#fbbf24;">
                  Prize Unlocked
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-family:Arial,sans-serif;color:#f9fafb;">
                <div style="font-size:16px;line-height:26px;color:#e5e7eb;">
                  ${intro}
                </div>
                <div style="padding-top:14px;font-size:15px;line-height:24px;color:#d1d5db;">
                  Use the ${isSinglePrize ? 'button' : 'buttons'} below to access your prize${isSinglePrize ? '' : 's'}:
                </div>
              </td>
            </tr>
            ${isSinglePrize ? `
            <tr>
              <td style="padding:0 24px 22px 24px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${primaryPrizeUrl}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="#f59e0b" fillcolor="#f59e0b">
                  <w:anchorlock/>
                  <center style="color:#111827;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                    Open Prize Link
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td bgcolor="#f59e0b" style="background-color:#f59e0b;">
                      <a
                        href="${primaryPrizeUrl}"
                        style="display:inline-block;padding:14px 18px;font-family:Arial,sans-serif;font-size:16px;line-height:16px;font-weight:700;color:#111827;text-decoration:none;background-color:#f59e0b;"
                      >
                        Open Prize Link
                      </a>
                    </td>
                  </tr>
                </table>
                <!--<![endif]-->
              </td>
            </tr>` : ''}
            <tr>
              <td style="padding:0 24px 22px 24px;">
                ${prizeCards}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 18px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#0f172a;border:1px solid #f59e0b;">
                  <tr>
                    <td style="padding:16px;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#f9fafb;">
                      <strong style="color:#fbbf24;">Need more information?</strong> Please contact the quiz host.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">
                Let's Go Quizzing and the app maker are not responsible for prize delivery.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
