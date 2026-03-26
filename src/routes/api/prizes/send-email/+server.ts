import { json } from '@sveltejs/kit';
import { loadConfig } from '$lib/server/config.js';
import { isPrizeEmailEnabled, sendPrizeEmail } from '$lib/server/prizes/service.js';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST({ request }) {
  const config = loadConfig();
  if (!isPrizeEmailEnabled(config)) {
    return json({ error: 'Prize email is disabled' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const redemptionId = typeof body?.redemptionId === 'string' ? body.redemptionId.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!redemptionId || !email) {
      return json({ error: 'redemptionId and email are required' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return json({ error: 'Enter a valid email address' }, { status: 400 });
    }
    await sendPrizeEmail({ redemptionId, email });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
