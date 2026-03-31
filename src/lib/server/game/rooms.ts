import { customAlphabet } from 'nanoid';
import type { GameState } from './state-machine.js';
import { loadQuiz } from '../storage/parser.js';
import { getEffectiveRoomIdLen } from '../config.js';
import type { RoomPrizeConfig } from '../../types/prizes.js';

function getNanoid() {
  const len = getEffectiveRoomIdLen();
  return customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', len);
}

const ROOMS_STORE_KEY = '__lgq_rooms_store__';

type RoomsStoreGlobal = typeof globalThis & {
  [ROOMS_STORE_KEY]?: Map<string, GameState>;
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
  };
  rooms.set(roomId, state);
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
