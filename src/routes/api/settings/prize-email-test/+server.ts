import { json } from '@sveltejs/kit';
import { jsonError, toErrorMessage } from '$lib/server/api-errors.js';
import { isAuthenticated } from '$lib/server/auth.js';
import { loadConfig } from '$lib/server/config.js';
import { testPrizeEmailTransport } from '$lib/server/prizes/service.js';

export async function POST({ request }) {
  const cookie = request.headers.get('cookie');
  if (!isAuthenticated(cookie ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const config = loadConfig();
  if (!config) {
    return json({ error: 'Config not found' }, { status: 404 });
  }
  try {
    await testPrizeEmailTransport(config);
    return json({ ok: true });
  } catch (error) {
    return jsonError(400, toErrorMessage(error));
  }
}
