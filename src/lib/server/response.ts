/**
 * Returns a JSON response with a Set-Cookie header.
 * Use for login, logout, setup, and settings routes that need to set auth cookies.
 */
export function jsonWithCookie(data: unknown, cookie: string): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}
