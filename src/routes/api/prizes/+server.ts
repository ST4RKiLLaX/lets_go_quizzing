import { json } from '@sveltejs/kit';
import { jsonError, toErrorMessage } from '$lib/server/api-errors.js';
import { ensurePrizeAdminAuthorized } from '$lib/server/prizes/route-guards.js';
import { createPrize, listPrizes } from '$lib/server/prizes/service.js';

export async function GET({ request }) {
  const unauthorized = ensurePrizeAdminAuthorized(request.headers.get('cookie'));
  if (unauthorized) return unauthorized;
  return json({ prizes: listPrizes() });
}

export async function POST({ request }) {
  const unauthorized = ensurePrizeAdminAuthorized(request.headers.get('cookie'));
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
    return jsonError(400, toErrorMessage(error));
  }
}
