import { json } from '@sveltejs/kit';
import { loadConfig } from '$lib/server/config.js';
import { isPrizeEmailEnabled, isPrizeFeatureEnabled, listPrizeOptions } from '$lib/server/prizes/service.js';

export async function GET() {
  const config = loadConfig();
  if (!isPrizeFeatureEnabled(config)) {
    return json({ enabled: false, emailEnabled: false, prizes: [] });
  }

  return json({
    enabled: true,
    emailEnabled: isPrizeEmailEnabled(config),
    defaultRoomPrizeConfig: config?.defaultRoomPrizeConfig ?? null,
    prizes: listPrizeOptions(),
  });
}
