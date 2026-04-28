import { afterEach, expect, test } from 'vitest';
import { createConfigAtomic } from '../src/lib/server/config.js';
import { GET } from '../src/routes/api/quizzes/+server.js';
import { makeAuthCookie } from './helpers/auth-cookie.js';
import { createTempCwdHarness } from './helpers/fs-isolation.js';

const fsHarness = createTempCwdHarness('lgq-quizzes-route-auth-');

afterEach(() => {
  fsHarness.cleanup();
});

test('quizzes GET requires host authentication', async () => {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
  });

  const response = await GET({
    request: new Request('http://localhost/api/quizzes'),
  } as Parameters<typeof GET>[0]);

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Unauthorized' });
});

test('quizzes GET returns list when authenticated', async () => {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
  });

  const response = await GET({
    request: new Request('http://localhost/api/quizzes', {
      headers: { cookie: makeAuthCookie() },
    }),
  } as Parameters<typeof GET>[0]);

  expect(response.status).toBe(200);
  expect(Array.isArray(await response.json())).toBe(true);
});
