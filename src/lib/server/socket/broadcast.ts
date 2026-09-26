import type { Server } from 'socket.io';
import type { GameState } from '../game/state-machine.js';
import { loadConfig } from '../config.js';
import {
  getPlayerQuizKey,
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

// Track the last-broadcast player quiz projection key per room. The player
// quiz projection changes only when this key changes, so we include the quiz
// payload in state:update only on those transitions. Host/projector quizzes
// are immutable per room, so we always omit their quiz in state:update.
const lastPlayerQuizKeyByRoom = new Map<string, string>();

export function resetRoomBroadcastCache(roomId: string): void {
  lastPlayerQuizKeyByRoom.delete(roomId);
}

function takeIncludePlayerQuiz(roomId: string, state: GameState): boolean {
  const key = getPlayerQuizKey(state);
  const previous = lastPlayerQuizKeyByRoom.get(roomId);
  if (previous === key) return false;
  lastPlayerQuizKeyByRoom.set(roomId, key);
  return true;
}

export async function broadcastStateToRoom(io: Server, roomId: string, state: GameState) {
  // Host/projector quiz is immutable per room; they receive it via join ack.
  io.to(hostRoom(roomId)).emit('state:update', { state: serializeHostState(state, { includeQuiz: false }) });
  io.to(projectorRoom(roomId)).emit('state:update', {
    state: serializeProjectorState(state, { includeQuiz: false }),
  });

  const includePlayerQuiz = takeIncludePlayerQuiz(roomId, state);

  if (needsPerPlayerState(state)) {
    // Hoist config once: prizeClaimToken generation runs per unique playerId.
    const config = loadConfig();
    const sockets = await io.in(playerRoom(roomId)).fetchSockets();
    const cache = new Map<string, ReturnType<typeof serializePlayerState>>();
    for (const s of sockets) {
      const playerId = String(s.data.playerId ?? '');
      const cacheKey = playerId || s.id;
      let payload = cache.get(cacheKey);
      if (!payload) {
        payload = serializePlayerState(state, playerId || undefined, {
          includeQuiz: includePlayerQuiz,
          config,
        });
        cache.set(cacheKey, payload);
      }
      s.emit('state:update', { state: payload });
    }
    return;
  }

  io.to(playerRoom(roomId)).emit('state:update', {
    state: serializePlayerState(state, undefined, { includeQuiz: includePlayerQuiz }),
  });
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
