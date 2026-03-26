import {
  readFileSync,
  existsSync,
  chmodSync,
  openSync,
  writeSync,
  closeSync,
} from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RoomPrizeDefaultConfig } from '../types/prizes.js';
import { ensureDataDir, getDataFilePath, writeDataJsonFileAtomic } from './json-file-store.js';
import { isValidEmailAddress, isValidSmtpPort } from './prizes/email.js';
import { RoomPrizeDefaultConfigSchema } from './prizes/schema.js';

const CONFIG_FILENAME = 'config.json';
const _SCRYPT_N = 16384;
const _SCRYPT_R = 8;
const _SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SALT_LEN = 32;

export type ProfanityFilterMode = 'off' | 'names' | 'public_text' | 'strict';

export interface AppConfig {
  version: number;
  adminUsername: string;
  adminPasswordHash: string;
  origin?: string;
  roomIdLen?: number;
  authEpoch?: number;
  profanityFilterMode?: ProfanityFilterMode;
  profanityAllowlist?: string[];
  customKeywordFilterEnabled?: boolean;
  customBlockedTerms?: string[];
  prizesEnabled?: boolean;
  prizeEmailEnabled?: boolean;
  prizeEmailSmtpHost?: string;
  prizeEmailSmtpPort?: number;
  prizeEmailSmtpSecure?: boolean;
  prizeEmailSmtpUsername?: string;
  prizeEmailFromEmail?: string;
  prizeEmailFromName?: string;
  defaultRoomPrizeConfig?: RoomPrizeDefaultConfig;
}

const REQUIRED_FIELDS = ['version', 'adminUsername', 'adminPasswordHash'] as const;

let configCache: AppConfig | null = null;
let configCacheValid = false;

function getConfigPath(): string {
  return getDataFilePath(CONFIG_FILENAME);
}

function validateConfig(raw: unknown): raw is AppConfig {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (o[f] === undefined || o[f] === null) return false;
  }
  if (typeof o.version !== 'number' || o.version < 1) return false;
  if (typeof o.adminUsername !== 'string' || o.adminUsername.length < 3) return false;
  if (typeof o.adminPasswordHash !== 'string' || !o.adminPasswordHash.includes(':')) return false;
  if (o.prizesEnabled !== undefined && typeof o.prizesEnabled !== 'boolean') return false;
  if (o.prizeEmailEnabled !== undefined && typeof o.prizeEmailEnabled !== 'boolean') return false;
  if (o.prizeEmailSmtpHost !== undefined && typeof o.prizeEmailSmtpHost !== 'string') return false;
  if (o.prizeEmailSmtpPort !== undefined && !isValidSmtpPort(o.prizeEmailSmtpPort)) {
    return false;
  }
  if (o.prizeEmailSmtpSecure !== undefined && typeof o.prizeEmailSmtpSecure !== 'boolean') return false;
  if (o.prizeEmailSmtpUsername !== undefined && typeof o.prizeEmailSmtpUsername !== 'string') return false;
  if (
    o.prizeEmailFromEmail !== undefined &&
    (typeof o.prizeEmailFromEmail !== 'string' || !isValidEmailAddress(o.prizeEmailFromEmail))
  ) {
    return false;
  }
  if (o.prizeEmailFromName !== undefined && typeof o.prizeEmailFromName !== 'string') return false;
  if (
    o.defaultRoomPrizeConfig !== undefined &&
    !RoomPrizeDefaultConfigSchema.safeParse(o.defaultRoomPrizeConfig).success
  ) {
    return false;
  }
  return true;
}

export function configFileExists(): boolean {
  return existsSync(getConfigPath());
}

export function hasValidOperationalConfig(): boolean {
  if (configCacheValid && configCache) return true;
  try {
    const raw = JSON.parse(readFileSync(getConfigPath(), 'utf8'));
    if (!validateConfig(raw)) return false;
    configCache = raw as AppConfig;
    configCacheValid = true;
    return true;
  } catch {
    return false;
  }
}

export const hasConfig = hasValidOperationalConfig;

export function loadConfig(): AppConfig | null {
  if (configCacheValid) return configCache;
  if (!configFileExists()) return null;
  try {
    const raw = JSON.parse(readFileSync(getConfigPath(), 'utf8'));
    if (!validateConfig(raw)) return null;
    configCache = raw as AppConfig;
    configCacheValid = true;
    return configCache;
  } catch {
    return null;
  }
}

function invalidateCache(): void {
  configCache = null;
  configCacheValid = false;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(input: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHash] = parts;
  try {
    const computed = scryptSync(input, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHash, 'hex');
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

export function saveConfig(partial: Partial<AppConfig>): void {
  const current = loadConfig();
  const next: AppConfig = {
    version: current?.version ?? 1,
    adminUsername: partial.adminUsername ?? current?.adminUsername ?? '',
    adminPasswordHash: partial.adminPasswordHash ?? current?.adminPasswordHash ?? '',
    origin: partial.origin !== undefined ? partial.origin : current?.origin,
    roomIdLen: partial.roomIdLen !== undefined ? partial.roomIdLen : current?.roomIdLen,
    authEpoch: partial.authEpoch !== undefined ? partial.authEpoch : (current?.authEpoch ?? 0),
    profanityFilterMode:
      partial.profanityFilterMode !== undefined ? partial.profanityFilterMode : current?.profanityFilterMode,
    profanityAllowlist:
      partial.profanityAllowlist !== undefined ? partial.profanityAllowlist : current?.profanityAllowlist,
    customKeywordFilterEnabled:
      partial.customKeywordFilterEnabled !== undefined
        ? partial.customKeywordFilterEnabled
        : current?.customKeywordFilterEnabled,
    customBlockedTerms:
      partial.customBlockedTerms !== undefined ? partial.customBlockedTerms : current?.customBlockedTerms,
    prizesEnabled: partial.prizesEnabled !== undefined ? partial.prizesEnabled : current?.prizesEnabled,
    prizeEmailEnabled:
      partial.prizeEmailEnabled !== undefined ? partial.prizeEmailEnabled : current?.prizeEmailEnabled,
    prizeEmailSmtpHost:
      partial.prizeEmailSmtpHost !== undefined ? partial.prizeEmailSmtpHost : current?.prizeEmailSmtpHost,
    prizeEmailSmtpPort:
      partial.prizeEmailSmtpPort !== undefined ? partial.prizeEmailSmtpPort : current?.prizeEmailSmtpPort,
    prizeEmailSmtpSecure:
      partial.prizeEmailSmtpSecure !== undefined ? partial.prizeEmailSmtpSecure : current?.prizeEmailSmtpSecure,
    prizeEmailSmtpUsername:
      partial.prizeEmailSmtpUsername !== undefined ? partial.prizeEmailSmtpUsername : current?.prizeEmailSmtpUsername,
    prizeEmailFromEmail:
      partial.prizeEmailFromEmail !== undefined ? partial.prizeEmailFromEmail : current?.prizeEmailFromEmail,
    prizeEmailFromName:
      partial.prizeEmailFromName !== undefined ? partial.prizeEmailFromName : current?.prizeEmailFromName,
    defaultRoomPrizeConfig:
      partial.defaultRoomPrizeConfig !== undefined ? partial.defaultRoomPrizeConfig : current?.defaultRoomPrizeConfig,
  };
  if (!next.adminUsername || !next.adminPasswordHash) {
    throw new Error('adminUsername and adminPasswordHash are required');
  }
  writeDataJsonFileAtomic(CONFIG_FILENAME, next, 'config');
  invalidateCache();
}

export function getEffectiveOrigin(): string | undefined {
  const envOrigin = process.env.ORIGIN?.trim();
  if (envOrigin) return envOrigin;
  const cfg = loadConfig();
  return cfg?.origin?.trim() || undefined;
}

export function createConfigAtomic(
  config: Omit<AppConfig, 'version' | 'authEpoch'> & Partial<Pick<AppConfig, 'version' | 'authEpoch'>>
): boolean {
  const full: AppConfig = {
    version: config.version ?? 1,
    authEpoch: config.authEpoch ?? 0,
    ...config,
  };
  if (!validateConfig(full)) throw new Error('Invalid config');
  ensureDataDir();
  const path = getConfigPath();
  try {
    const fd = openSync(path, 'wx');
    try {
      writeSync(fd, JSON.stringify(full, null, 2), 0, 'utf8');
    } finally {
      closeSync(fd);
    }
    try {
      chmodSync(path, 0o600);
    } catch {
      console.warn('[config] Could not set restrictive permissions on config file');
    }
    invalidateCache();
    return true;
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'EEXIST') return false;
    throw e;
  }
}

export function getProfanityFilterMode(): ProfanityFilterMode {
  const cfg = loadConfig();
  const mode = cfg?.profanityFilterMode;
  if (mode === 'off' || mode === 'names' || mode === 'public_text' || mode === 'strict') return mode;
  return 'off';
}

export function getCustomKeywordFilterEnabled(): boolean {
  const cfg = loadConfig();
  return cfg?.customKeywordFilterEnabled === true;
}

export function getCustomBlockedTerms(): string[] {
  const cfg = loadConfig();
  const terms = cfg?.customBlockedTerms;
  return Array.isArray(terms) ? terms : [];
}

export function getPrizesEnabled(): boolean {
  return loadConfig()?.prizesEnabled === true;
}

export function getPrizeEmailEnabled(): boolean {
  const cfg = loadConfig();
  return cfg?.prizeEmailEnabled === true && cfg?.prizesEnabled === true;
}

export function getEffectiveRoomIdLen(): number {
  const envVal = process.env.ROOM_ID_LEN;
  if (envVal != null) {
    const n = parseInt(envVal, 10);
    if (Number.isInteger(n) && n >= 4 && n <= 12) return n;
  }
  const cfg = loadConfig();
  const cfgVal = cfg?.roomIdLen;
  if (cfgVal != null && Number.isInteger(cfgVal) && cfgVal >= 4 && cfgVal <= 12) return cfgVal;
  return 6;
}
