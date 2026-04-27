import type { SerializedState } from '$lib/types/game.js';

export function getSerializedTimerEndsAt(state: SerializedState | null | undefined): number | undefined {
  if (!state) return undefined;
  if (state.type === 'Question' || state.type === 'RevealAnswer') {
    return state.timerEndsAt;
  }
  return undefined;
}

export function isSerializedActiveQuizPhase(state: SerializedState | null | undefined): boolean {
  return state?.type === 'Question' || state?.type === 'RevealAnswer';
}

export function getClockOffsetMs(serverNow: number | null | undefined, nowMs: number): number {
  if (serverNow == null) return 0;
  return serverNow - nowMs;
}
