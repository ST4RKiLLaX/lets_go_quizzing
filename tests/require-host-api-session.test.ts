import { afterEach, expect, test } from 'vitest';
import { createSession } from '../src/lib/server/auth.js';
import { createConfigAtomic } from '../src/lib/server/config.js';
import { requireHostApiSession } from '../src/lib/server/require-host-api-session.js';
import { createTempCwdHarness } from './helpers/fs-isolation.js';

const fsHarness = createTempCwdHarness('lgq-host-api-session-');

afterEach(() => {
  fsHarness.cleanup();
});

test('returns 503 when hosting is disabled', async () => {
  fsHarness.prepare();
  const result = requireHostApiSession(new Request('http://localhost/api/quizzes'));
  expect(result?.status).toBe(503);
  expect(result ? await result.json() : null).toEqual({ error: 'Hosting disabled' });
});

test('returns 401 when hosting is enabled but session is missing', async () => {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
  });

  const result = requireHostApiSession(new Request('http://localhost/api/quizzes'));
  expect(result?.status).toBe(401);
  expect(result ? await result.json() : null).toEqual({ error: 'Unauthorized' });
});

test('returns null when valid host session is present', () => {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
  });
  const { cookie } = createSession();
  const result = requireHostApiSession(
    new Request('http://localhost/api/quizzes', {
      headers: { cookie },
    })
  );
  expect(result).toBeNull();
});
