import type { AppConfig } from '$lib/server/config.js';
import { getRoom } from '$lib/server/game/rooms.js';
import type { GameState } from '$lib/server/game/state-machine.js';
import { verifyPrizeClaimToken } from '$lib/server/prizes/service.js';

export type PrizeClaimIds = {
  roomId: string;
  playerId: string;
  token: string;
};

type PlayerEntry = GameState['players'] extends Map<string, infer TPlayer> ? TPlayer : never;

export type VerifiedPrizeClaimContext =
  | { ok: true; ids: PrizeClaimIds; state: GameState; player: PlayerEntry }
  | { ok: false; reason: 'room_not_found' | 'token_invalid' };

export function parsePrizeClaimIdsFromBody(body: unknown): PrizeClaimIds | null {
  const roomId = typeof (body as { roomId?: unknown } | null)?.roomId === 'string' ? (body as { roomId: string }).roomId.trim() : '';
  const playerId =
    typeof (body as { playerId?: unknown } | null)?.playerId === 'string' ? (body as { playerId: string }).playerId.trim() : '';
  const token = typeof (body as { token?: unknown } | null)?.token === 'string' ? (body as { token: string }).token.trim() : '';
  if (!roomId || !playerId || !token) return null;
  return { roomId, playerId, token };
}

export function parsePrizeClaimIdsFromUrl(url: URL): PrizeClaimIds | null {
  const roomId = url.searchParams.get('roomId')?.trim() ?? '';
  const playerId = url.searchParams.get('playerId')?.trim() ?? '';
  const token = url.searchParams.get('token')?.trim() ?? '';
  if (!roomId || !playerId || !token) return null;
  return { roomId, playerId, token };
}

export function resolveVerifiedPrizeClaimContext(
  config: AppConfig | null | undefined,
  ids: PrizeClaimIds
): VerifiedPrizeClaimContext {
  const state = getRoom(ids.roomId);
  if (!state) return { ok: false, reason: 'room_not_found' };

  const player = state.players.get(ids.playerId);
  if (
    !player ||
    !verifyPrizeClaimToken({
      token: ids.token,
      roomId: ids.roomId,
      playerId: ids.playerId,
      finalScore: player.score,
      quizFilename: state.quizFilename,
      startedAt: state.startedAt,
      config,
    })
  ) {
    return { ok: false, reason: 'token_invalid' };
  }

  return {
    ok: true,
    ids,
    state,
    player,
  };
}
