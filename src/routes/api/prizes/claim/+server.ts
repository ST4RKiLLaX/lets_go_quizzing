import { json } from '@sveltejs/kit';
import { jsonError, toErrorMessage } from '$lib/server/api-errors.js';
import { loadConfig } from '$lib/server/config.js';
import {
  parsePrizeClaimIdsFromBody,
  resolveVerifiedPrizeClaimContext,
} from '$lib/server/prizes/claim-context.js';
import { claimPrizeForPlayer, getPrizeEmailPolicy, isPrizeFeatureEnabled } from '$lib/server/prizes/service.js';

export async function POST({ request }) {
  const config = loadConfig();
  const emailPolicy = getPrizeEmailPolicy(config);
  if (!isPrizeFeatureEnabled(config)) {
    return json({ error: 'Prize feature disabled' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const ids = parsePrizeClaimIdsFromBody(body);
    if (!ids) {
      return json({ error: 'roomId, playerId, and token are required' }, { status: 400 });
    }

    const claimContext = resolveVerifiedPrizeClaimContext(config, ids);
    if (!claimContext.ok) {
      if (claimContext.reason === 'room_not_found') {
        return json({ error: 'Room not found' }, { status: 404 });
      }
      return json({ error: 'Invalid prize claim token' }, { status: 403 });
    }

    const redemption = await claimPrizeForPlayer(claimContext.state, claimContext.ids.playerId, config);
    return json({
      ok: true,
      claimId: redemption.claimId,
      prizes: redemption.prizes,
      bestTier: redemption.bestTier,
      matchedTiers: redemption.matchedTiers,
      emailConfigured: emailPolicy.featureEnabled,
      emailAvailableNow: emailPolicy.availableNow,
    });
  } catch (error) {
    return jsonError(400, toErrorMessage(error));
  }
}
