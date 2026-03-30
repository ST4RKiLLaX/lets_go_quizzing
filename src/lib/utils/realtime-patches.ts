import type { SerializedQuestionPatch, SerializedRoomPatch, SerializedState } from '$lib/types/game.js';

export function getStateQuestionIdentity(state: SerializedState | null | undefined): string {
  if (!state) return '';
  const questionId = state.quiz?.rounds?.[state.currentRoundIndex]?.questions?.[state.currentQuestionIndex]?.id ?? 'none';
  return `${state.roomId}:${state.type}:${state.currentRoundIndex}:${state.currentQuestionIndex}:${questionId}`;
}

export function getQuestionPatchIdentity(patch: SerializedQuestionPatch): string {
  return `${patch.roomId}:${patch.type}:${patch.currentRoundIndex}:${patch.currentQuestionIndex}:${patch.questionId}`;
}

export function isQuestionPatchForState(
  state: SerializedState | null | undefined,
  patch: SerializedQuestionPatch
): boolean {
  if (!state || state.type !== 'Question') return false;
  return getStateQuestionIdentity(state) === getQuestionPatchIdentity(patch);
}

export function isQuestionPatchForCurrentQuestion(
  state: SerializedState | null | undefined,
  patch: SerializedQuestionPatch | null | undefined
): boolean {
  if (!state || !patch) return false;
  if (state.type !== 'Question' && state.type !== 'RevealAnswer') return false;
  const questionId = state.quiz?.rounds?.[state.currentRoundIndex]?.questions?.[state.currentQuestionIndex]?.id;
  return (
    state.roomId === patch.roomId &&
    state.currentRoundIndex === patch.currentRoundIndex &&
    state.currentQuestionIndex === patch.currentQuestionIndex &&
    questionId === patch.questionId
  );
}

export function applyRoomPatch(
  state: SerializedState | null,
  patch: SerializedRoomPatch
): SerializedState | null {
  if (!state || state.roomId !== patch.roomId) return state;
  const nextState: SerializedState = {
    ...state,
    players: patch.players,
  };
  if (patch.pendingPlayers !== undefined) {
    nextState.pendingPlayers = patch.pendingPlayers;
  }
  return nextState;
}
