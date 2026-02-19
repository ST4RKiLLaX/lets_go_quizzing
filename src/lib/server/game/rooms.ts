import { customAlphabet } from 'nanoid';
import type { GameState } from './state-machine.js';
import { loadQuiz } from '../storage/parser.js';

const ROOM_ID_LEN = Math.max(4, Math.min(12, parseInt(process.env.ROOM_ID_LEN ?? '6', 10) || 6));
const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ROOM_ID_LEN);

const rooms = new Map<string, GameState>();

export function createRoom(quizFilename: string, hostSocketId: string): string {
  const roomId = nanoid();
  const quiz = loadQuiz(quizFilename);
  const state: GameState = {
    type: 'Lobby',
    roomId,
    quiz,
    quizFilename,
    hostSocketId,
    players: new Map(),
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
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
  return nanoid();
}

export function roomExists(roomId: string): boolean {
  return rooms.has(roomId);
}
