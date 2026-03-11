import { createHash, timingSafeEqual } from 'node:crypto';
import {
  loadConfig,
  hasValidOperationalConfig,
  verifyPassword as verifyPasswordScrypt,
} from '../config.js';

const SESSION_COOKIE = 'lgq_host_auth';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type SessionEntry = { expiry: number; authEpoch: number };

type HostAuthState = {
  storeId: string;
  tokens: Map<string, SessionEntry>;
  cleanupStarted: boolean;
};

const HOST_AUTH_STATE_KEY = '__lgq_host_auth_state__';
const hostAuthState = ((globalThis as Record<string, unknown>)[HOST_AUTH_STATE_KEY] as HostAuthState | undefined) ?? {
  storeId: crypto.randomUUID(),
  tokens: new Map<string, SessionEntry>(),
  cleanupStarted: false,
};
(globalThis as Record<string, unknown>)[HOST_AUTH_STATE_KEY] = hostAuthState;
const tokens = hostAuthState.tokens;

function cleanupExpiredTokens(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [token, entry] of tokens.entries()) {
    if (now > entry.expiry) toDelete.push(token);
  }
  for (const token of toDelete) tokens.delete(token);
}

if (!hostAuthState.cleanupStarted) {
  hostAuthState.cleanupStarted = true;
  setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);
}

export function verifyPasswordConstantTime(input: string, expected: string): boolean {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;
  const a = createHash('sha256').update(input, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
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

export function createSession(options?: { secure?: boolean; authEpoch?: number }): { token: string; cookie: string } {
  const token = generateToken();
  const expiry = Date.now() + SESSION_MAX_AGE * 1000;
  const cfg = loadConfig();
  const authEpoch = options?.authEpoch ?? cfg?.authEpoch ?? 0;
  tokens.set(token, { expiry, authEpoch });
  const secure = options?.secure ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
  return { token, cookie };
}

export function isAuthenticated(cookieHeader: string | undefined): boolean {
  const cookies = parseCookie(cookieHeader);
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  const entry = tokens.get(token);
  if (!entry || Date.now() > entry.expiry) {
    tokens.delete(token);
    return false;
  }
  const cfg = loadConfig();
  if (cfg && entry.authEpoch !== (cfg.authEpoch ?? 0)) {
    tokens.delete(token);
    return false;
  }
  return true;
}

export function requireHostAuth(): boolean {
  if (hasValidOperationalConfig()) return true;
  if (process.env.HOST_PASSWORD) return true;
  return false;
}

export function requireHostPassword(): boolean {
  return requireHostAuth();
}

export function verifyAdmin(username: string, password: string): boolean {
  const cfg = loadConfig();
  if (!cfg) return false;
  if (typeof username !== 'string' || !username.trim()) return false;
  if (cfg.adminUsername !== username.trim()) return false;
  return verifyPasswordScrypt(password, cfg.adminPasswordHash);
}

export function verifyWithEnvOrConfig(username: string, password: string): boolean {
  const cfg = loadConfig();
  if (cfg) {
    return verifyAdmin(username, password);
  }
  const envPwd = process.env.HOST_PASSWORD;
  if (envPwd && verifyPasswordConstantTime(password, envPwd)) {
    return true;
  }
  return false;
}

export function getCurrentAuthEpoch(): number {
  const cfg = loadConfig();
  return cfg?.authEpoch ?? 0;
}
