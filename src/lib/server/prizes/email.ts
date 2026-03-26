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
