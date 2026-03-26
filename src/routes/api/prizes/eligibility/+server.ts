import { json } from '@sveltejs/kit';
import { loadConfig } from '$lib/server/config.js';
import { getRoom } from '$lib/server/game/rooms.js';
import { getPrizeEligibility, isPrizeFeatureEnabled, verifyPrizeClaimToken } from '$lib/server/prizes/service.js';

export async function GET({ url }) {
  const config = loadConfig();
  if (!isPrizeFeatureEnabled(config)) {
    return json({ enabled: false, eligible: false });
  }

  const roomId = url.searchParams.get('roomId')?.trim();
  const playerId = url.searchParams.get('playerId')?.trim();
  const token = url.searchParams.get('token')?.trim();
  if (!roomId || !playerId || !token) {
    return json({ error: 'roomId, playerId, and token are required' }, { status: 400 });
  }
  const state = getRoom(roomId);
  const player = state?.players.get(playerId);
  if (
    !state ||
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
    return json({ enabled: true, eligible: false, reason: 'not_eligible', emailEnabled: false });
  }

  const eligibility = getPrizeEligibility(state, playerId, config);
  return json({
    enabled: true,
    ...eligibility,
    emailEnabled: config?.prizeEmailEnabled === true,
  });
}
