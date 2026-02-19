import { timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'lgq_host_auth';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const tokens = new Map<string, number>(); // token -> expiry timestamp

function cleanupExpiredTokens(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [token, expiry] of tokens.entries()) {
    if (now > expiry) toDelete.push(token);
  }
  for (const token of toDelete) tokens.delete(token);
}

// Periodic cleanup to prevent unbounded memory growth
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);

export function verifyPasswordConstantTime(input: string, expected: string): boolean {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function generateToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

function parseCookie(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [key, ...val] = part.trim().split('=');
    if (key && val.length) out[key] = val.join('=').trim();
  }
  return out;
}

export function createSession(options?: { secure?: boolean }): { token: string; cookie: string } {
  const token = generateToken();
  const expiry = Date.now() + SESSION_MAX_AGE * 1000;
  tokens.set(token, expiry);
  const secure = options?.secure ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
  return { token, cookie };
}

export function isAuthenticated(cookieHeader: string | undefined): boolean {
  const cookies = parseCookie(cookieHeader);
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  const expiry = tokens.get(token);
  if (!expiry || Date.now() > expiry) {
    tokens.delete(token);
    return false;
  }
  return true;
}

export function requireHostPassword(): boolean {
  return !!process.env.HOST_PASSWORD;
}
