import {
  readFileSync,
  existsSync,
} from 'node:fs';
import { getDataFilePath, writeDataJsonFileAtomic } from './json-file-store.js';

const SECRETS_FILENAME = 'secrets.json';

interface SecretStore {
  version: number;
  prizeEmailSmtpPassword?: string;
}

let secretsCache: SecretStore | null = null;
let secretsCacheValid = false;

function getSecretsPath(): string {
  return getDataFilePath(SECRETS_FILENAME);
}

function validateSecretStore(raw: unknown): raw is SecretStore {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== 'number' || o.version < 1) return false;
  if (o.prizeEmailSmtpPassword !== undefined && typeof o.prizeEmailSmtpPassword !== 'string') return false;
  return true;
}

function invalidateCache(): void {
  secretsCache = null;
  secretsCacheValid = false;
}

export function secretsFileExists(): boolean {
  return existsSync(getSecretsPath());
}

export function loadSecretStore(): SecretStore {
  if (secretsCacheValid && secretsCache) return secretsCache;
  if (!secretsFileExists()) {
    const emptyStore: SecretStore = { version: 1 };
    secretsCache = emptyStore;
    secretsCacheValid = true;
    return emptyStore;
  }
  try {
    const raw = JSON.parse(readFileSync(getSecretsPath(), 'utf8'));
    if (!validateSecretStore(raw)) {
      throw new Error('Invalid secrets store');
    }
    secretsCache = raw as SecretStore;
    secretsCacheValid = true;
    return secretsCache;
  } catch {
    const emptyStore: SecretStore = { version: 1 };
    secretsCache = emptyStore;
    secretsCacheValid = true;
    return emptyStore;
  }
}

export function saveSecretStore(partial: Partial<SecretStore>): void {
  const current = loadSecretStore();
  const hasPasswordUpdate = Object.prototype.hasOwnProperty.call(partial, 'prizeEmailSmtpPassword');
  const next: SecretStore = {
    version: current.version ?? 1,
    prizeEmailSmtpPassword: hasPasswordUpdate ? partial.prizeEmailSmtpPassword : current.prizeEmailSmtpPassword,
  };
  if (!validateSecretStore(next)) {
    throw new Error('Invalid secret store');
  }
  writeDataJsonFileAtomic(SECRETS_FILENAME, next, 'secrets');
  invalidateCache();
}

export function getPrizeEmailSmtpPassword(): string | undefined {
  return loadSecretStore().prizeEmailSmtpPassword?.trim() || undefined;
}

export function hasPrizeEmailSmtpPassword(): boolean {
  return !!getPrizeEmailSmtpPassword();
}

export function setPrizeEmailSmtpPassword(password: string): void {
  const normalized = password.trim();
  if (!normalized) {
    throw new Error('SMTP password is required');
  }
  saveSecretStore({ prizeEmailSmtpPassword: normalized });
}

export function clearPrizeEmailSmtpPassword(): void {
  saveSecretStore({ prizeEmailSmtpPassword: undefined });
}
