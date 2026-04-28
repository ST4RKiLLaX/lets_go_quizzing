import type { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { createRoom, getRoom, setRoom, roomExists, removePendingPlayerBySocketId } from '../game/rooms.js';
import { transition } from '../game/state-machine.js';
import { scoreSubmissions } from '../game/scoring.js';
import { serializeHostState, serializePlayerState, serializeProjectorState } from './serializers.js';
import { broadcastRoomPatchToRoom, broadcastStateToRoom } from './broadcast.js';
import { saveHistory } from './history.js';
import { logHostAuthFailure } from './host-auth-log.js';

export interface SocketHandlerContext {
  io: Server;
  socket: Socket;
  getRoom: typeof getRoom;
  setRoom: typeof setRoom;
  roomExists: typeof roomExists;
  createRoom: typeof createRoom;
  removePendingPlayerBySocketId: typeof removePendingPlayerBySocketId;
  transition: typeof transition;
  scoreSubmissions: typeof scoreSubmissions;
  serializeHostState: typeof serializeHostState;
  serializePlayerState: typeof serializePlayerState;
  serializeProjectorState: typeof serializeProjectorState;
  broadcastStateToRoom: typeof broadcastStateToRoom;
  broadcastRoomPatchToRoom: typeof broadcastRoomPatchToRoom;
  saveHistory: typeof saveHistory;
  logHostAuthFailure: typeof logHostAuthFailure;
}

export function createSocketHandlerContext(io: Server, socket: Socket): SocketHandlerContext {
  return {
    io,
    socket,
    getRoom,
    setRoom,
    roomExists,
    createRoom,
    removePendingPlayerBySocketId,
    transition,
    scoreSubmissions,
    serializeHostState,
    serializePlayerState,
    serializeProjectorState,
    broadcastStateToRoom,
    broadcastRoomPatchToRoom,
    saveHistory,
    logHostAuthFailure,
  };
}
