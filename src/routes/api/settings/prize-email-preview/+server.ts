import { isAuthenticated } from '$lib/server/auth.js';
import { buildPrizeEmailHtml } from '$lib/server/prizes/email.js';

const SAMPLE_PRIZES = [
  { prizeName: 'Free Training Course', prizeUrl: 'https://example.com/free-training-course' },
  { prizeName: 'VIP Backstage Pass', prizeUrl: 'https://example.com/vip-pass' },
];

export async function GET({ request }) {
  const cookie = request.headers.get('cookie');
  if (!isAuthenticated(cookie ?? undefined)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const html = buildPrizeEmailHtml({
    prizes: SAMPLE_PRIZES,
  });

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
