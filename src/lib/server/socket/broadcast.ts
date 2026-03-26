import type { Server } from 'socket.io';
import type { GameState } from '../game/state-machine.js';
import {
  serializeHostState,
  serializePlayerState,
  serializeProjectorState,
  serializeQuestionPatch,
  serializeRoomPatch,
} from './serializers.js';

export async function broadcastStateToRoom(io: Server, roomId: string, state: GameState) {
  const sockets = await io.in(roomId).fetchSockets();
  let hostState: ReturnType<typeof serializeHostState> | null = null;
  const playerStates = new Map<string, ReturnType<typeof serializePlayerState>>();
  let projectorState: ReturnType<typeof serializeProjectorState> | null = null;
  for (const s of sockets) {
    if (s.data.role === 'host') {
      hostState ??= serializeHostState(state);
      s.emit('state:update', { state: hostState });
      continue;
    }
    if (s.data.role === 'projector') {
      projectorState ??= serializeProjectorState(state);
      s.emit('state:update', { state: projectorState });
      continue;
    }
    const playerId = String(s.data.playerId ?? '');
    const cacheKey = playerId || s.id;
    const playerState = playerStates.get(cacheKey) ?? serializePlayerState(state, playerId || undefined);
    playerStates.set(cacheKey, playerState);
    s.emit('state:update', { state: playerState });
  }
}

export async function broadcastRoomPatchToRoom(io: Server, roomId: string, state: GameState) {
  const sockets = await io.in(roomId).fetchSockets();
  let hostPatch: ReturnType<typeof serializeRoomPatch> | null = null;
  let participantPatch: ReturnType<typeof serializeRoomPatch> | null = null;
  for (const socket of sockets) {
    if (socket.data.role === 'host') {
      hostPatch ??= serializeRoomPatch(state, { forHost: true });
      socket.emit('room:patch', { patch: hostPatch });
      continue;
    }
    participantPatch ??= serializeRoomPatch(state, { forHost: false });
    socket.emit('room:patch', { patch: participantPatch });
  }
}

export async function broadcastQuestionPatchToRoom(io: Server, roomId: string, state: GameState) {
  const sockets = await io.in(roomId).fetchSockets();
  let hostPatch: ReturnType<typeof serializeQuestionPatch> | null = null;
  let projectorPatch: ReturnType<typeof serializeQuestionPatch> | null = null;
  for (const socket of sockets) {
    if (socket.data.role === 'host') {
      hostPatch ??= serializeQuestionPatch(state, 'host');
      if (hostPatch) socket.emit('question:patch', { patch: hostPatch });
      continue;
    }
    if (socket.data.role === 'projector') {
      projectorPatch ??= serializeQuestionPatch(state, 'projector');
      if (projectorPatch) socket.emit('question:patch', { patch: projectorPatch });
    }
  }
}
