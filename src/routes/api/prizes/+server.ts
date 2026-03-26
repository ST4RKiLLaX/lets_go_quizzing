import { json } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth.js';
import { loadConfig } from '$lib/server/config.js';
import { createPrize, isPrizeFeatureEnabled, listPrizes } from '$lib/server/prizes/service.js';

function ensureAuthorized(cookie: string | null): Response | null {
  if (!isAuthenticated(cookie ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPrizeFeatureEnabled(loadConfig())) {
    return json({ error: 'Prize feature disabled' }, { status: 404 });
  }
  return null;
}

export async function GET({ request }) {
  const unauthorized = ensureAuthorized(request.headers.get('cookie'));
  if (unauthorized) return unauthorized;
  return json({ prizes: listPrizes() });
}

export async function POST({ request }) {
  const unauthorized = ensureAuthorized(request.headers.get('cookie'));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const prize = await createPrize({
      name: typeof body?.name === 'string' ? body.name : '',
      url: typeof body?.url === 'string' ? body.url : '',
      limit: Number(body?.limit),
      expirationDate: typeof body?.expirationDate === 'string' ? body.expirationDate : '',
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    });
    return json({ ok: true, prize });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
