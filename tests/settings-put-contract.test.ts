import { afterEach, expect, test } from 'vitest';
import { createConfigAtomic } from '../src/lib/server/config.js';
import { GET, PUT } from '../src/routes/api/settings/+server.js';
import { makeAuthCookie } from './helpers/auth-cookie.js';
import { createTempCwdHarness } from './helpers/fs-isolation.js';

const fsHarness = createTempCwdHarness('lgq-settings-contract-');

afterEach(() => {
  fsHarness.cleanup();
});

test('settings GET and PUT require authentication', async () => {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
  });

  const getRes = await GET({
    request: new Request('http://localhost/api/settings'),
  } as Parameters<typeof GET>[0]);
  expect(getRes.status).toBe(401);
  expect(await getRes.json()).toEqual({ error: 'Unauthorized' });

  const putRes = await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'http://example.com' }),
    }),
  } as Parameters<typeof PUT>[0]);
  expect(putRes.status).toBe(401);
  expect(await putRes.json()).toEqual({ error: 'Unauthorized' });
});

test('settings GET and PUT return 404 when config is missing', async () => {
  fsHarness.prepare();
  const cookie = makeAuthCookie();

  const getRes = await GET({
    request: new Request('http://localhost/api/settings', {
      headers: { cookie },
    }),
  } as Parameters<typeof GET>[0]);
  expect(getRes.status).toBe(404);
  expect(await getRes.json()).toEqual({ error: 'Config not found' });

  const putRes = await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ origin: 'http://example.com' }),
    }),
  } as Parameters<typeof PUT>[0]);
  expect(putRes.status).toBe(404);
  expect(await putRes.json()).toEqual({ error: 'Config not found' });
});

test('settings PUT preserves known validation responses', async () => {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
    prizesEnabled: true,
  });
  const cookie = makeAuthCookie();

  const invalidMode = await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ profanityFilterMode: 'bad_mode' }),
    }),
  } as Parameters<typeof PUT>[0]);
  expect(invalidMode.status).toBe(400);
  expect(await invalidMode.json()).toEqual({ error: 'Invalid profanity filter mode' });

  const conflictingPasswordFlags = await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        clearPrizeEmailSmtpPassword: true,
        prizeEmailSmtpPassword: 'new-secret',
      }),
    }),
  } as Parameters<typeof PUT>[0]);
  expect(conflictingPasswordFlags.status).toBe(400);
  expect(await conflictingPasswordFlags.json()).toEqual({ error: 'Choose either replace password or clear password' });
});

test('settings PUT keeps invalid default room prize config response contract', async () => {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
    prizesEnabled: true,
  });
  const cookie = makeAuthCookie();

  const response = await PUT({
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        defaultRoomPrizeConfig: { enabledByDefault: true, tiers: [{ nonsense: true }] },
      }),
    }),
  } as Parameters<typeof PUT>[0]);

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Update failed' });
});
