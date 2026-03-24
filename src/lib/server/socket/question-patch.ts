import type { Server } from 'socket.io';
import type { GameState } from '../game/state-machine.js';
import { broadcastQuestionPatchToRoom } from './broadcast.js';

const QUESTION_PATCH_BATCH_MS = 100;
const pendingQuestionPatchTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function queueQuestionPatch(
  io: Server,
  roomId: string,
  getRoom: (roomId: string) => GameState | undefined,
  delayMs = QUESTION_PATCH_BATCH_MS
): void {
  if (pendingQuestionPatchTimers.has(roomId)) return;
  const timer = setTimeout(() => {
    pendingQuestionPatchTimers.delete(roomId);
    const state = getRoom(roomId);
    if (!state || state.type !== 'Question') return;
    void broadcastQuestionPatchToRoom(io, roomId, state);
  }, delayMs);
  pendingQuestionPatchTimers.set(roomId, timer);
}

export async function flushQueuedQuestionPatch(
  io: Server,
  roomId: string,
  state: GameState | undefined
): Promise<void> {
  const timer = pendingQuestionPatchTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    pendingQuestionPatchTimers.delete(roomId);
  }
  if (!state || state.type !== 'Question') return;
  await broadcastQuestionPatchToRoom(io, roomId, state);
}
