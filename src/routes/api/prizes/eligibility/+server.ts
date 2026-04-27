import { json } from '@sveltejs/kit';
import { loadConfig } from '$lib/server/config.js';
import {
  parsePrizeClaimIdsFromUrl,
  resolveVerifiedPrizeClaimContext,
} from '$lib/server/prizes/claim-context.js';
import { getPrizeEligibility, getPrizeEmailPolicy, isPrizeFeatureEnabled } from '$lib/server/prizes/service.js';

export async function GET({ url }) {
  const config = loadConfig();
  const emailPolicy = getPrizeEmailPolicy(config);
  if (!isPrizeFeatureEnabled(config)) {
    return json({ enabled: false, eligible: false, emailConfigured: false, emailAvailableNow: false });
  }

  const ids = parsePrizeClaimIdsFromUrl(url);
  if (!ids) {
    return json({ error: 'roomId, playerId, and token are required' }, { status: 400 });
  }
  const claimContext = resolveVerifiedPrizeClaimContext(config, ids);
  if (!claimContext.ok) {
    return json({
      enabled: true,
      eligible: false,
      reason: 'not_eligible',
      emailConfigured: emailPolicy.featureEnabled,
      emailAvailableNow: emailPolicy.availableNow,
    });
  }

  const eligibility = getPrizeEligibility(claimContext.state, claimContext.ids.playerId, config);
  return json({
    enabled: true,
    ...eligibility,
    emailConfigured: emailPolicy.featureEnabled,
    emailAvailableNow: emailPolicy.availableNow,
  });
}
