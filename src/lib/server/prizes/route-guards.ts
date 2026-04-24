import { json } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth.js';
import { loadConfig } from '$lib/server/config.js';
import { isPrizeFeatureEnabled } from '$lib/server/prizes/service.js';

export function ensurePrizeAdminAuthorized(cookie: string | null): Response | null {
  if (!isAuthenticated(cookie ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPrizeFeatureEnabled(loadConfig())) {
    return json({ error: 'Prize feature disabled' }, { status: 404 });
  }
  return null;
}
