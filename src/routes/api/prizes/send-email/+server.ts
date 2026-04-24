import { json } from '@sveltejs/kit';
import { jsonError, toErrorMessage } from '$lib/server/api-errors.js';
import { loadConfig } from '$lib/server/config.js';
import { isValidEmailAddress } from '$lib/server/prizes/email.js';
import { getPrizeEmailPolicy, sendPrizeEmail } from '$lib/server/prizes/service.js';

export async function POST({ request }) {
  const config = loadConfig();
  if (!getPrizeEmailPolicy(config).availableNow) {
    return json({ error: 'Prize email is disabled' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const claimId = typeof body?.claimId === 'string' ? body.claimId.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!claimId || !email) {
      return json({ error: 'claimId and email are required' }, { status: 400 });
    }
    if (!isValidEmailAddress(email)) {
      return json({ error: 'Enter a valid email address' }, { status: 400 });
    }
    await sendPrizeEmail({ claimId, email });
    return json({ ok: true });
  } catch (error) {
    return jsonError(400, toErrorMessage(error));
  }
}
