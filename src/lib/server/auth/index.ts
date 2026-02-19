const SESSION_COOKIE = 'lgq_host_auth';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours
const tokens = new Map<string, number>(); // token -> expiry timestamp

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

export function createSession(): { token: string; cookie: string } {
  const token = generateToken();
  const expiry = Date.now() + SESSION_MAX_AGE * 1000;
  tokens.set(token, expiry);
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
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
