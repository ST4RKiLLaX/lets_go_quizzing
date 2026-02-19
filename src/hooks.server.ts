import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self'";
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'`
  );
  return response;
};
