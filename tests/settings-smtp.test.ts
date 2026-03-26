import { afterEach, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { createSession } from '../src/lib/server/auth.js';
import { createConfigAtomic, loadConfig } from '../src/lib/server/config.js';
import { getPrizeEmailSmtpPassword, setPrizeEmailSmtpPassword } from '../src/lib/server/secrets.js';
import { GET, PUT } from '../src/routes/api/settings/+server.js';
import { POST as TEST_SMTP_POST } from '../src/routes/api/settings/prize-email-test/+server.js';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

const ORIGINAL_CWD = process.cwd();
let tempDir: string | null = null;

function prepareTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'lgq-settings-smtp-'));
  process.chdir(tempDir);
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
    prizesEnabled: true,
    prizeEmailEnabled: false,
    prizeEmailSmtpHost: 'smtp.example.com',
    prizeEmailSmtpPort: 587,
    prizeEmailSmtpSecure: false,
    prizeEmailSmtpUsername: 'mailer@example.com',
    prizeEmailFromEmail: 'noreply@example.com',
    prizeEmailFromName: 'Quiz Mailer',
  });
}

function makeCookie(): string {
  return createSession().cookie;
}

afterEach(() => {
  vi.clearAllMocks();
  process.chdir(ORIGINAL_CWD);
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

test('settings GET returns readable SMTP config and masked password status only', async () => {
  prepareTempDir();
  setPrizeEmailSmtpPassword('smtp-secret');

  const response = await GET({
    request: new Request('http://localhost/api/settings', {
      headers: { cookie: makeCookie() },
    }),
  } as Parameters<typeof GET>[0]);

  const data = await response.json();

  expect(response.ok).toBe(true);
  expect(data.prizeEmailSmtpHost).toBe('smtp.example.com');
  expect(data.prizeEmailSmtpUsername).toBe('mailer@example.com');
  expect(data.prizeEmailFromEmail).toBe('noreply@example.com');
  expect(data.prizeEmailSmtpPasswordConfigured).toBe(true);
  expect(data.prizeEmailAvailableNow).toBe(false);
  expect('prizeEmailSmtpPassword' in data).toBe(false);
});

test('settings PUT preserves SMTP password when updating readable fields', async () => {
  prepareTempDir();
  setPrizeEmailSmtpPassword('smtp-secret');

  const response = await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: makeCookie() },
      body: JSON.stringify({
        prizeEmailFromName: 'Updated Mailer',
      }),
    }),
  } as Parameters<typeof PUT>[0]);

  expect(response.ok).toBe(true);
  expect(loadConfig()?.prizeEmailFromName).toBe('Updated Mailer');
  expect(getPrizeEmailSmtpPassword()).toBe('smtp-secret');
});

test('settings PUT can clear SMTP password when prize email is disabled', async () => {
  prepareTempDir();
  setPrizeEmailSmtpPassword('smtp-secret');

  const response = await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: makeCookie() },
      body: JSON.stringify({
        prizeEmailEnabled: false,
        clearPrizeEmailSmtpPassword: true,
      }),
    }),
  } as Parameters<typeof PUT>[0]);

  expect(response.ok).toBe(true);
  expect(getPrizeEmailSmtpPassword()).toBeUndefined();
});

test('SMTP test endpoint verifies saved configuration without returning secrets', async () => {
  prepareTempDir();
  setPrizeEmailSmtpPassword('smtp-secret');

  const response = await TEST_SMTP_POST({
    request: new Request('http://localhost/api/settings/prize-email-test', {
      method: 'POST',
      headers: { cookie: makeCookie() },
    }),
  } as Parameters<typeof TEST_SMTP_POST>[0]);

  const data = await response.json();

  expect(response.ok).toBe(true);
  expect(data.ok).toBe(true);
  expect(nodemailer.createTransport).toHaveBeenCalledWith({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'mailer@example.com',
      pass: 'smtp-secret',
    },
  });
});

test('settings GET reports email available now when feature and transport are both ready', async () => {
  prepareTempDir();
  setPrizeEmailSmtpPassword('smtp-secret');

  await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: makeCookie() },
      body: JSON.stringify({
        prizeEmailEnabled: true,
      }),
    }),
  } as Parameters<typeof PUT>[0]);

  const response = await GET({
    request: new Request('http://localhost/api/settings', {
      headers: { cookie: makeCookie() },
    }),
  } as Parameters<typeof GET>[0]);

  const data = await response.json();

  expect(response.ok).toBe(true);
  expect(data.prizeEmailAvailableNow).toBe(true);
});
