import { chmodSync, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const DATA_DIR = 'data';

export function getDataFilePath(filename: string): string {
  return join(process.cwd(), DATA_DIR, filename);
}

export function ensureDataDir(): void {
  const dir = join(process.cwd(), DATA_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function writeDataJsonFileAtomic(filename: string, value: unknown, permissionWarningLabel: string): void {
  ensureDataDir();

  const finalPath = getDataFilePath(filename);
  const tempPath = `${finalPath}.tmp.${randomBytes(8).toString('hex')}`;

  try {
    writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
    renameSync(tempPath, finalPath);
    try {
      chmodSync(finalPath, 0o600);
    } catch {
      console.warn(`[${permissionWarningLabel}] Could not set restrictive permissions on ${filename}`);
    }
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    throw error;
  }
}
