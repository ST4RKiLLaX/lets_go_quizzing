/**
 * In-memory, single-process room store.
 *
 * HORIZONTAL SCALE (multi-instance) blocker:
 *   This module keeps GameState in a globalThis-pinned Map. Nothing else in
 *   the socket pipeline is stateful across broadcasts, so this store is the
 *   single blocker for running >1 server instance.
 *
 *   To go multi-instance you would need BOTH:
 *   1. A Socket.IO adapter (e.g. @socket.io/redis-adapter) so io.to(room)
 *      fan-out reaches sockets on other instances. See src/lib/server/socket.ts.
 *   2. An externalized room store (Redis / durable KV / DB) replacing this
 *      Map. GameState mutations here are already immutable spreads, so the
 *      migration is mainly wiring: getRoom/setRoom become async lookups
 *      against the external store; the sweeper moves to a background worker
 *      or is dropped in favor of store-level TTLs.
 *
 *   The per-room WeakMap serialization caches in serializers.ts and the
 *   per-room quiz-key cache in broadcast.ts are process-local and would
 *   need to be re-warmed on each instance (already correct: they are keyed
 *   by object identity and rebuild on the first broadcast per instance).
 */
import { customAlphabet } from 'nanoid';
import type { GameState } from './state-machine.js';
import { loadQuiz } from '../storage/parser.js';
import { getEffectiveRoomIdLen } from '../config.js';
import type { RoomPrizeConfig } from '../../types/prizes.js';
import { resetRoomBroadcastCache } from '../socket/broadcast.js';

function getNanoid() {
  const len = getEffectiveRoomIdLen();
  return customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', len);
}

const ROOMS_STORE_KEY = '__lgq_rooms_store__';
const SWEEPER_KEY = '__lgq_rooms_sweeper__';

// Rooms in End state are deleted this long after endedAt (allows late
// scoreboard views / prize claims), and Lobby rooms without players are
// deleted this long after createdAt (abandoned rooms).
const END_ROOM_TTL_MS = 30 * 60 * 1000;
const IDLE_LOBBY_TTL_MS = 4 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

type RoomsStoreGlobal = typeof globalThis & {
  [ROOMS_STORE_KEY]?: Map<string, GameState>;
  [SWEEPER_KEY]?: ReturnType<typeof setInterval>;
};

function getRoomsStore(): Map<string, GameState> {
  const globalStore = globalThis as RoomsStoreGlobal;
  globalStore[ROOMS_STORE_KEY] ??= new Map<string, GameState>();
  return globalStore[ROOMS_STORE_KEY];
}

const rooms = getRoomsStore();

export function createRoom(
  quizFilename: string,
  hostSocketId: string,
  playerJoinPassword?: string,
  waitingRoomEnabled?: boolean,
  allowLateJoin?: boolean,
  autoAdmitBeforeGame?: boolean,
  manualAdmitAfterGame?: boolean,
  roomPrizeConfig?: RoomPrizeConfig
): string {
  const roomId = getNanoid()();
  const quiz = loadQuiz(quizFilename);
  const trimmedPlayerJoinPassword = playerJoinPassword?.trim();
  const state: GameState = {
    type: 'Lobby',
    roomId,
    quiz,
    quizFilename,
    playerJoinPassword: trimmedPlayerJoinPassword || undefined,
    hostSocketId,
    players: new Map(),
    pendingPlayers: new Map(),
    waitingRoomEnabled: !!waitingRoomEnabled,
    allowLateJoin: !!allowLateJoin,
    autoAdmitBeforeGame: autoAdmitBeforeGame ?? !!waitingRoomEnabled,
    manualAdmitAfterGame: manualAdmitAfterGame ?? true,
    roomPrizeConfig,
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
    questionStartedAt: undefined,
    createdAt: Date.now(),
  };
  rooms.set(roomId, state);
  ensureSweeper();
  return roomId;
}

export function getRoom(roomId: string): GameState | undefined {
  return rooms.get(roomId);
}

export function setRoom(roomId: string, state: GameState): void {
  rooms.set(roomId, state);
}

export function listRooms(): GameState[] {
  return Array.from(rooms.values());
}

export function generateRoomId(): string {
  return getNanoid()();
}

export function roomExists(roomId: string): boolean {
  return rooms.has(roomId);
}

export function removePendingPlayerBySocketId(socketId: string): string | undefined {
  for (const [roomId, state] of rooms) {
    const pending = state.pendingPlayers ?? new Map();
    if (pending.size === 0) continue;
    for (const [playerId, p] of pending) {
      if (p.socketId === socketId) {
        const next = new Map(pending);
        next.delete(playerId);
        rooms.set(roomId, { ...state, pendingPlayers: next });
        return roomId;
      }
    }
  }
  return undefined;
}

export function clearPendingPlayerSocketBySocketId(socketId: string): string | undefined {
  for (const [roomId, state] of rooms) {
    const pending = state.pendingPlayers ?? new Map();
    if (pending.size === 0) continue;
    for (const [playerId, p] of pending) {
      if (p.socketId === socketId) {
        const next = new Map(pending);
        next.set(playerId, { ...p, socketId: undefined });
        rooms.set(roomId, { ...state, pendingPlayers: next });
        return roomId;
      }
    }
  }
  return undefined;
}

export function deleteRoom(roomId: string): boolean {
  const deleted = rooms.delete(roomId);
  if (deleted) {
    resetRoomBroadcastCache(roomId);
  }
  return deleted;
}

// Removes rooms that are either past the End TTL or idle Lobby rooms with no
// players. Idempotent and safe to call frequently.
export function sweepIdleRooms(nowMs: number = Date.now()): number {
  let removed = 0;
  for (const [roomId, state] of rooms) {
    const endedAt = state.endedAt;
    if (state.type === 'End' && endedAt != null && nowMs - endedAt >= END_ROOM_TTL_MS) {
      if (deleteRoom(roomId)) removed++;
      continue;
    }
    const createdAt = state.createdAt;
    if (
      state.type === 'Lobby' &&
      state.players.size === 0 &&
      (state.pendingPlayers?.size ?? 0) === 0 &&
      createdAt != null &&
      nowMs - createdAt >= IDLE_LOBBY_TTL_MS
    ) {
      if (deleteRoom(roomId)) removed++;
    }
  }
  return removed;
}

function ensureSweeper(): void {
  const globalStore = globalThis as RoomsStoreGlobal;
  if (globalStore[SWEEPER_KEY]) return;
  const handle = setInterval(() => {
    try {
      sweepIdleRooms();
    } catch (e) {
      console.error('rooms sweeper error:', e);
    }
  }, SWEEP_INTERVAL_MS);
  // Don't block process exit on the sweeper.
  if (typeof (handle as { unref?: () => void }).unref === 'function') {
    (handle as { unref: () => void }).unref();
  }
  globalStore[SWEEPER_KEY] = handle;
}

// Test-only: stop the interval when tearing down mocks / hot-reload dev cycles.
export function stopRoomsSweeper(): void {
  const globalStore = globalThis as RoomsStoreGlobal;
  const handle = globalStore[SWEEPER_KEY];
  if (handle) {
    clearInterval(handle);
    globalStore[SWEEPER_KEY] = undefined;
  }
}
