import { json } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth.js';
import { loadConfig } from '$lib/server/config.js';
import { deletePrize, isPrizeFeatureEnabled, updatePrize } from '$lib/server/prizes/service.js';

function ensureAuthorized(cookie: string | null): Response | null {
  if (!isAuthenticated(cookie ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPrizeFeatureEnabled(loadConfig())) {
    return json({ error: 'Prize feature disabled' }, { status: 404 });
  }
  return null;
}

export async function PUT({ request, params }) {
  const unauthorized = ensureAuthorized(request.headers.get('cookie'));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const prize = await updatePrize(params.id, {
      name: typeof body?.name === 'string' ? body.name : undefined,
      url: typeof body?.url === 'string' ? body.url : undefined,
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      expirationDate: typeof body?.expirationDate === 'string' ? body.expirationDate : undefined,
      active: typeof body?.active === 'boolean' ? body.active : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    });
    return json({ ok: true, prize });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE({ request, params }) {
  const unauthorized = ensureAuthorized(request.headers.get('cookie'));
  if (unauthorized) return unauthorized;

  try {
    await deletePrize(params.id);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
