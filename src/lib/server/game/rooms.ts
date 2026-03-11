import { customAlphabet } from 'nanoid';
import type { GameState } from './state-machine.js';
import { loadQuiz } from '../storage/parser.js';
import { getEffectiveRoomIdLen } from '../config.js';

function getNanoid() {
  const len = getEffectiveRoomIdLen();
  return customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', len);
}

const rooms = new Map<string, GameState>();

export function createRoom(
  quizFilename: string,
  hostSocketId: string,
  playerJoinPassword?: string
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
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
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

export function generateRoomId(): string {
  return getNanoid()();
}

export function roomExists(roomId: string): boolean {
  return rooms.has(roomId);
}
