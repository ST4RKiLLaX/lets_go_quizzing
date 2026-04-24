import { afterEach, expect, test, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  lookup: lookupMock,
}));

import { createConfigAtomic } from '../src/lib/server/config.js';
import { POST } from '../src/routes/api/quizzes/images/import-url/+server.js';
import { makeAuthCookie } from './helpers/auth-cookie.js';
import { createTempCwdHarness } from './helpers/fs-isolation.js';

const ORIGINAL_FETCH = global.fetch;
const fsHarness = createTempCwdHarness('lgq-image-import-');

function prepareTempDir() {
  fsHarness.prepare();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
  });
}

function makeCookie(): string {
  return makeAuthCookie();
}

function makeRequest(body: Record<string, unknown>, withCookie = true): Request {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (withCookie) {
    headers.cookie = makeCookie();
  }
  return new Request('http://localhost/api/quizzes/images/import-url', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  lookupMock.mockReset();
  global.fetch = ORIGINAL_FETCH;
  fsHarness.cleanup();
});

test('quiz image import requires authentication', async () => {
  prepareTempDir();

  const response = await POST({
    request: makeRequest(
      {
        quizFilename: 'sample.yaml',
        questionId: 'q1',
        url: 'https://example.com/image.png',
      },
      false
    ),
  } as Parameters<typeof POST>[0]);

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Unauthorized' });
});

test('quiz image import rejects invalid quiz filename or question ID', async () => {
  prepareTempDir();

  const invalidQuizResponse = await POST({
    request: makeRequest({
      quizFilename: '../bad.yaml',
      questionId: 'q1',
      url: 'https://example.com/image.png',
    }),
  } as Parameters<typeof POST>[0]);

  expect(invalidQuizResponse.status).toBe(400);
  expect(await invalidQuizResponse.json()).toEqual({ error: 'Invalid quiz filename' });

  const invalidQuestionResponse = await POST({
    request: makeRequest({
      quizFilename: 'sample.yaml',
      questionId: 'bad/id',
      url: 'https://example.com/image.png',
    }),
  } as Parameters<typeof POST>[0]);

  expect(invalidQuestionResponse.status).toBe(400);
  expect(await invalidQuestionResponse.json()).toEqual({ error: 'Invalid question ID' });
});

test('quiz image import rejects invalid URL protocols', async () => {
  prepareTempDir();

  const response = await POST({
    request: makeRequest({
      quizFilename: 'sample.yaml',
      questionId: 'q1',
      url: 'ftp://example.com/image.png',
    }),
  } as Parameters<typeof POST>[0]);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Image URL must use http or https.' });
});

test('quiz image import blocks private and local addresses', async () => {
  prepareTempDir();
  lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
  global.fetch = vi.fn() as typeof fetch;

  const response = await POST({
    request: makeRequest({
      quizFilename: 'sample.yaml',
      questionId: 'q1',
      url: 'https://example.com/image.png',
    }),
  } as Parameters<typeof POST>[0]);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Remote host is not allowed.' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('quiz image import rejects unsupported MIME types', async () => {
  prepareTempDir();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  global.fetch = vi.fn().mockResolvedValue(
    new Response('not-an-image', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  ) as typeof fetch;

  const response = await POST({
    request: makeRequest({
      quizFilename: 'sample.yaml',
      questionId: 'q1',
      url: 'https://example.com/image.png',
    }),
  } as Parameters<typeof POST>[0]);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Remote file is not a supported image type.' });
});

test('quiz image import rejects oversized responses', async () => {
  prepareTempDir();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  global.fetch = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(5 * 1024 * 1024 + 1),
      },
    })
  ) as typeof fetch;

  const response = await POST({
    request: makeRequest({
      quizFilename: 'sample.yaml',
      questionId: 'q1',
      url: 'https://example.com/image.png',
    }),
  } as Parameters<typeof POST>[0]);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Remote image is too large. Max 5MB.' });
});

test('quiz image import stores the fetched image locally', async () => {
  prepareTempDir();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  global.fetch = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([7, 8, 9]), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    })
  ) as typeof fetch;

  const response = await POST({
    request: makeRequest({
      quizFilename: 'sample.yaml',
      questionId: 'q1',
      url: 'https://example.com/image.png',
    }),
  } as Parameters<typeof POST>[0]);

  const data = await response.json();
  const storedPath = join(fsHarness.getTempDir()!, 'data', 'quizzes', 'images', 'sample', 'q1.png');

  expect(response.ok).toBe(true);
  expect(data).toEqual({ filename: 'q1.png' });
  expect(existsSync(storedPath)).toBe(true);
  expect(Array.from(readFileSync(storedPath))).toEqual([7, 8, 9]);
});
