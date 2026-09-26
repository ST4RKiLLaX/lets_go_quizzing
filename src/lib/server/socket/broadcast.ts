import type { Server } from 'socket.io';
import type { GameState } from '../game/state-machine.js';
import {
  serializeHostState,
  serializePlayerState,
  serializeProjectorState,
  serializeQuestionPatch,
  serializeRoomPatch,
} from './serializers.js';

export function hostRoom(roomId: string): string {
  return `${roomId}:host`;
}

export function projectorRoom(roomId: string): string {
  return `${roomId}:projector`;
}

export function playerRoom(roomId: string): string {
  return `${roomId}:player`;
}

// Player payloads are per-player only at End with prizes enabled (per-player
// prizeClaimToken). All other phases produce an identical payload for every
// player, so we can serialize once and fan out via io.to(playerRoom).
function needsPerPlayerState(state: GameState): boolean {
  return state.type === 'End' && !!state.roomPrizeConfig?.enabled;
}

export async function broadcastStateToRoom(io: Server, roomId: string, state: GameState) {
  io.to(hostRoom(roomId)).emit('state:update', { state: serializeHostState(state) });
  io.to(projectorRoom(roomId)).emit('state:update', { state: serializeProjectorState(state) });

  if (needsPerPlayerState(state)) {
    const sockets = await io.in(playerRoom(roomId)).fetchSockets();
    const cache = new Map<string, ReturnType<typeof serializePlayerState>>();
    for (const s of sockets) {
      const playerId = String(s.data.playerId ?? '');
      const cacheKey = playerId || s.id;
      let payload = cache.get(cacheKey);
      if (!payload) {
        payload = serializePlayerState(state, playerId || undefined);
        cache.set(cacheKey, payload);
      }
      s.emit('state:update', { state: payload });
    }
    return;
  }

  io.to(playerRoom(roomId)).emit('state:update', { state: serializePlayerState(state) });
}

export async function broadcastRoomPatchToRoom(io: Server, roomId: string, state: GameState) {
  io.to(hostRoom(roomId)).emit('room:patch', { patch: serializeRoomPatch(state, { forHost: true }) });
  const participantPatch = serializeRoomPatch(state, { forHost: false });
  io.to(projectorRoom(roomId)).emit('room:patch', { patch: participantPatch });
  io.to(playerRoom(roomId)).emit('room:patch', { patch: participantPatch });
}

export async function broadcastQuestionPatchToRoom(io: Server, roomId: string, state: GameState) {
  const hostPatch = serializeQuestionPatch(state, 'host');
  if (hostPatch) {
    io.to(hostRoom(roomId)).emit('question:patch', { patch: hostPatch });
  }
  const projectorPatch = serializeQuestionPatch(state, 'projector');
  if (projectorPatch) {
    io.to(projectorRoom(roomId)).emit('question:patch', { patch: projectorPatch });
  }
}
