import { afterEach, expect, test } from 'vitest';
import {
  clearPrizeEmailSmtpPassword,
  getPrizeEmailSmtpPassword,
  hasPrizeEmailSmtpPassword,
  setPrizeEmailSmtpPassword,
} from '../src/lib/server/secrets.js';
import { createTempCwdHarness } from './helpers/fs-isolation.js';

const fsHarness = createTempCwdHarness('lgq-secrets-');

function prepareTempDir() {
  fsHarness.prepare();
}

afterEach(() => {
  fsHarness.cleanup();
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
