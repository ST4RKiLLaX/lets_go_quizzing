const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const SOCKET_WINDOW_MS = 60 * 1000; // 1 minute
const PLAYER_JOIN_MAX = 10;
const HOST_JOIN_MAX = 5;
const LOAD_TEST_PLAYER_JOIN_MAX_ENV = 'LOAD_TEST_PLAYER_JOIN_MAX';

const attempts = new Map<string, { count: number; resetAt: number }>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [key, entry] of attempts.entries()) {
    if (now >= entry.resetAt) toDelete.push(key);
  }
  for (const key of toDelete) attempts.delete(key);
}

const RATE_LIMIT_CLEANUP_MS = 5 * 60 * 1000; // 5 minutes
setInterval(cleanupExpiredEntries, RATE_LIMIT_CLEANUP_MS);

function parseEnvPositiveInt(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.warn(`[rate-limit] Ignoring invalid ${name} value: ${raw}`);
    return undefined;
  }
  return parsed;
}

export function getConfiguredPlayerJoinMax(): number {
  return parseEnvPositiveInt(LOAD_TEST_PLAYER_JOIN_MAX_ENV) ?? PLAYER_JOIN_MAX;
}

function checkRateLimit(prefix: string, identifier: string, windowMs: number, maxAttempts: number): boolean {
  const key = `${prefix}:${identifier}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= maxAttempts;
}

export function checkLoginRateLimit(identifier: string): boolean {
  return checkRateLimit('login', identifier, WINDOW_MS, MAX_ATTEMPTS);
}

export function checkSetupRateLimit(identifier: string): boolean {
  return checkRateLimit('setup', identifier, WINDOW_MS, MAX_ATTEMPTS);
}

export function checkPlayerJoinRateLimit(identifier: string): boolean {
  return checkRateLimit('player:join', identifier, SOCKET_WINDOW_MS, getConfiguredPlayerJoinMax());
}

export function checkHostCreateRateLimit(identifier: string): boolean {
  return checkRateLimit('host:create', identifier, SOCKET_WINDOW_MS, HOST_JOIN_MAX);
}

export function checkHostJoinRateLimit(identifier: string): boolean {
  return checkRateLimit('host:join', identifier, SOCKET_WINDOW_MS, HOST_JOIN_MAX);
}

export function checkHostGetStateRateLimit(identifier: string): boolean {
  return checkRateLimit('host:get_state', identifier, SOCKET_WINDOW_MS, 30);
}
