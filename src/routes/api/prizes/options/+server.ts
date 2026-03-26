import { json } from '@sveltejs/kit';
import { loadConfig } from '$lib/server/config.js';
import { getPrizeEmailPolicy, isPrizeFeatureEnabled, listPrizeOptions } from '$lib/server/prizes/service.js';

export async function GET() {
  const config = loadConfig();
  if (!isPrizeFeatureEnabled(config)) {
    return json({ enabled: false, emailConfigured: false, emailAvailableNow: false, prizes: [] });
  }
  const emailPolicy = getPrizeEmailPolicy(config);

  return json({
    enabled: true,
    emailConfigured: emailPolicy.featureEnabled,
    emailAvailableNow: emailPolicy.availableNow,
    defaultRoomPrizeConfig: config?.defaultRoomPrizeConfig ?? null,
    prizes: listPrizeOptions(),
  });
}
