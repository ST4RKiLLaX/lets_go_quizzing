import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const SECRETS_FILENAME = 'secrets.json';
const DATA_DIR = 'data';

interface SecretStore {
  version: number;
  prizeEmailSmtpPassword?: string;
}

let secretsCache: SecretStore | null = null;
let secretsCacheValid = false;

function getSecretsPath(): string {
  return join(process.cwd(), DATA_DIR, SECRETS_FILENAME);
}

function getTempPath(): string {
  return getSecretsPath() + '.tmp.' + randomBytes(8).toString('hex');
}

function ensureDataDir(): void {
  const dir = join(process.cwd(), DATA_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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
  ensureDataDir();
  const finalPath = getSecretsPath();
  const tempPath = getTempPath();
  try {
    writeFileSync(tempPath, JSON.stringify(next, null, 2), 'utf8');
    renameSync(tempPath, finalPath);
    try {
      chmodSync(finalPath, 0o600);
    } catch {
      console.warn('[secrets] Could not set restrictive permissions on secrets file');
    }
  } catch (e) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    throw e;
  }
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
