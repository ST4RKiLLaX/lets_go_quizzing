const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = attempts.get(identifier);
  if (!entry) {
    attempts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    attempts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}
