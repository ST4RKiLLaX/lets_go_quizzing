import { json } from '@sveltejs/kit';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { requireHostApiSession } from '$lib/server/require-host-api-session.js';
import { isValidQuizFilename } from '$lib/server/storage/parser.js';
import {
  QUIZ_IMAGE_MAX_SIZE,
  isValidQuestionId,
  normalizeQuizImageMime,
  writeQuizImageForQuestion,
} from '$lib/server/storage/quiz-images.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

class ImportImageError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ImportBody = {
  quizFilename?: unknown;
  questionId?: unknown;
  url?: unknown;
};

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    return isBlockedIpAddress(normalized.slice('::ffff:'.length));
  }
  return false;
}

function isBlockedIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

function validateRemoteUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImportImageError(400, 'Image URL must be a valid http or https URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ImportImageError(400, 'Image URL must use http or https.');
  }
  if (url.username || url.password) {
    throw new ImportImageError(400, 'Image URL must not include embedded credentials.');
  }
  const hostname = url.hostname.trim().toLowerCase();
  if (!hostname) {
    throw new ImportImageError(400, 'Image URL must include a hostname.');
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new ImportImageError(400, 'Remote host is not allowed.');
  }
  return url;
}

async function assertSafeRemoteUrl(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new ImportImageError(400, 'Remote host is not allowed.');
    }
    return;
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ImportImageError(400, 'Could not resolve remote host.');
  }
  if (!records.length) {
    throw new ImportImageError(400, 'Could not resolve remote host.');
  }
  if (records.some((record) => isBlockedIpAddress(record.address))) {
    throw new ImportImageError(400, 'Remote host is not allowed.');
  }
}

async function fetchWithRedirects(url: URL): Promise<Response> {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertSafeRemoteUrl(currentUrl);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ImportImageError(504, 'Remote image request timed out.');
      }
      throw new ImportImageError(502, 'Failed to fetch remote image.');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new ImportImageError(502, 'Remote image redirect did not include a location.');
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new ImportImageError(502, 'Remote image redirected too many times.');
      }
      currentUrl = validateRemoteUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new ImportImageError(502, `Remote server returned ${response.status}.`);
    }
    return response;
  }
  throw new ImportImageError(502, 'Remote image redirected too many times.');
}

async function readRemoteImage(response: Response): Promise<{ buffer: Uint8Array; mimeType: string }> {
  const mimeType = normalizeQuizImageMime(response.headers.get('content-type'));
  if (!mimeType) {
    throw new ImportImageError(400, 'Remote file is not a supported image type.');
  }

  const contentLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > QUIZ_IMAGE_MAX_SIZE) {
    throw new ImportImageError(400, 'Remote image is too large. Max 5MB.');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > QUIZ_IMAGE_MAX_SIZE) {
      throw new ImportImageError(400, 'Remote image is too large. Max 5MB.');
    }
    return { buffer: data, mimeType };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > QUIZ_IMAGE_MAX_SIZE) {
      throw new ImportImageError(400, 'Remote image is too large. Max 5MB.');
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { buffer, mimeType };
}

export async function POST({ request }) {
  const unauthorized = requireHostApiSession(request);
  if (unauthorized) return unauthorized;

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const quizFilename = typeof body.quizFilename === 'string' ? body.quizFilename : '';
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';

  if (!isValidQuizFilename(quizFilename)) {
    return json({ error: 'Invalid quiz filename' }, { status: 400 });
  }
  if (!isValidQuestionId(questionId)) {
    return json({ error: 'Invalid question ID' }, { status: 400 });
  }
  if (!rawUrl) {
    return json({ error: 'Image URL is required.' }, { status: 400 });
  }

  try {
    const url = validateRemoteUrl(rawUrl);
    const response = await fetchWithRedirects(url);
    const { buffer, mimeType } = await readRemoteImage(response);
    const filename = await writeQuizImageForQuestion({
      quizFilename,
      questionId,
      mimeType,
      buffer,
    });
    return json({ filename });
  } catch (error) {
    if (error instanceof ImportImageError) {
      return json({ error: error.message }, { status: error.status });
    }
    console.error('[images] Import from URL failed:', error);
    return json({ error: 'Image import failed.' }, { status: 500 });
  }
}
