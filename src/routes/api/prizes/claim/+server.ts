import { json } from '@sveltejs/kit';
import { jsonError, toErrorMessage } from '$lib/server/api-errors.js';
import { loadConfig } from '$lib/server/config.js';
import { getRoom } from '$lib/server/game/rooms.js';
import { claimPrizeForPlayer, getPrizeEmailPolicy, isPrizeFeatureEnabled, verifyPrizeClaimToken } from '$lib/server/prizes/service.js';

export async function POST({ request }) {
  const config = loadConfig();
  const emailPolicy = getPrizeEmailPolicy(config);
  if (!isPrizeFeatureEnabled(config)) {
    return json({ error: 'Prize feature disabled' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!roomId || !playerId || !token) {
      return json({ error: 'roomId, playerId, and token are required' }, { status: 400 });
    }
    const state = getRoom(roomId);
    if (!state) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    const player = state.players.get(playerId);
    if (
      !player ||
      !verifyPrizeClaimToken({
        token,
        roomId,
        playerId,
        finalScore: player.score,
        quizFilename: state.quizFilename,
        startedAt: state.startedAt,
        config,
      })
    ) {
      return json({ error: 'Invalid prize claim token' }, { status: 403 });
    }
    const redemption = await claimPrizeForPlayer(state, playerId, config);
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
