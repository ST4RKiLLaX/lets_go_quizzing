import { json } from '@sveltejs/kit';
import { jsonError, toErrorMessage } from '$lib/server/api-errors.js';
import { ensurePrizeAdminAuthorized } from '$lib/server/prizes/route-guards.js';
import { deletePrize, updatePrize } from '$lib/server/prizes/service.js';

export async function PUT({ request, params }) {
  const unauthorized = ensurePrizeAdminAuthorized(request.headers.get('cookie'));
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
    return jsonError(400, toErrorMessage(error));
  }
}

export async function DELETE({ request, params }) {
  const unauthorized = ensurePrizeAdminAuthorized(request.headers.get('cookie'));
  if (unauthorized) return unauthorized;

  try {
    await deletePrize(params.id);
    return json({ ok: true });
  } catch (error) {
    return jsonError(400, toErrorMessage(error));
  }
}
