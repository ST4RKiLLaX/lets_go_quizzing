import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearPrizeEmailSmtpPassword,
  getPrizeEmailSmtpPassword,
  hasPrizeEmailSmtpPassword,
  setPrizeEmailSmtpPassword,
} from '../src/lib/server/secrets.js';

const ORIGINAL_CWD = process.cwd();
let tempDir: string | null = null;

function prepareTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'lgq-secrets-'));
  process.chdir(tempDir);
}

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

test('secret store persists SMTP password and clear removes it', () => {
  prepareTempDir();

  expect(hasPrizeEmailSmtpPassword()).toBe(false);
  expect(getPrizeEmailSmtpPassword()).toBeUndefined();

  setPrizeEmailSmtpPassword('smtp-secret');

  expect(hasPrizeEmailSmtpPassword()).toBe(true);
  expect(getPrizeEmailSmtpPassword()).toBe('smtp-secret');

  clearPrizeEmailSmtpPassword();

  expect(hasPrizeEmailSmtpPassword()).toBe(false);
  expect(getPrizeEmailSmtpPassword()).toBeUndefined();
});
