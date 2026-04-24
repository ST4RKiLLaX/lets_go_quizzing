import { createSession } from '../../src/lib/server/auth.js';

export function makeAuthCookie(): string {
  return createSession().cookie;
}
