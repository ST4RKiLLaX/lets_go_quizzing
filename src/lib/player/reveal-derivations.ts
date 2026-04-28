import type { RevealData } from '$lib/components/player/PlayerRevealView.svelte';
import { getOptionCounts } from '$lib/player/question-helpers.js';
import type { SerializedState } from '$lib/types/game.js';
import type { Question } from '$lib/types/quiz.js';

export function buildRevealData(params: {
  state: SerializedState | null;
  currentQuestion: Question | null;
  playerId: string;
  currentQuestionId?: string;
  selectedAnswer: { questionId: string; answerIndex: number } | null;
  selectedMultiSelect: { questionId: string; answerIndexes: number[] } | null;
  selectedReorder: { questionId: string; answerIndexes: number[] } | null;
  selectedMatching: { questionId: string; answerIndexes: number[] } | null;
  selectedSlider: { questionId: string; answerNumber: number } | null;
  reorderDraft: number[];
  matchingDraft: number[];
  hotspotDraftByQuestionId: Record<string, { x: number; y: number }>;
}): RevealData {
  const { state, currentQuestion, playerId } = params;
  const q = state?.type === 'RevealAnswer' ? currentQuestion : null;
  if (!q) return {};

  const qId = q.id;
  const submission = state?.submissions?.find((s) => s.playerId === playerId && s.questionId === qId);
  const base: RevealData = {};

  if (q.type === 'hotspot') {
    if (submission?.answerX != null && submission?.answerY != null) {
      base.submittedHotspot = { x: submission.answerX, y: submission.answerY };
    } else if (params.hotspotDraftByQuestionId[qId]) {
      const draft = params.hotspotDraftByQuestionId[qId];
      base.submittedHotspot = { x: draft.x, y: draft.y };
    }
  } else if (q.type === 'choice' || q.type === 'true_false' || q.type === 'poll') {
    const idx = submission?.answerIndex ?? (params.selectedAnswer?.questionId === qId ? params.selectedAnswer.answerIndex : undefined);
    if (idx != null) base.submittedAnswerIndex = idx;
  } else if (q.type === 'multi_select' || q.type === 'reorder' || q.type === 'click_to_match' || q.type === 'drag_and_drop') {
    const idxs =
      (submission?.answerIndexes?.length ? submission.answerIndexes : undefined) ??
      (params.selectedMultiSelect?.questionId === qId ? params.selectedMultiSelect.answerIndexes : undefined) ??
      (params.selectedReorder?.questionId === qId ? params.selectedReorder.answerIndexes : undefined) ??
      (params.selectedMatching?.questionId === qId ? params.selectedMatching.answerIndexes : undefined) ??
      (q.type === 'reorder' && params.reorderDraft.length > 0 ? params.reorderDraft : undefined) ??
      ((q.type === 'click_to_match' || q.type === 'drag_and_drop') &&
      qId === params.currentQuestionId &&
      params.matchingDraft.every((v) => v >= 0)
        ? params.matchingDraft
        : undefined);
    if (idxs?.length) base.submittedAnswerIndexes = [...idxs];
  } else if (q.type === 'slider') {
    const num = submission?.answerNumber ?? (params.selectedSlider?.questionId === qId ? params.selectedSlider.answerNumber : undefined);
    if (num != null) base.submittedAnswerNumber = num;
  } else if (q.type === 'input' || q.type === 'open_ended' || q.type === 'word_cloud') {
    if (submission?.answerText != null) base.submittedAnswerText = submission.answerText;
  }

  if (q.type === 'poll') {
    const counts = getOptionCounts(state?.submissions ?? [], qId);
    base.optionCounts = Object.fromEntries(counts);
  }
  const markedWrong = state?.wrongAnswers?.some((w) => w.playerId === playerId && w.questionId === qId) ?? false;
  base.wasCorrect = submission != null && !markedWrong;
  return base;
}

export function isPlayerCorrectOnReveal(state: SerializedState | null, playerId: string, questionId: string): boolean {
  if (!questionId || state?.type !== 'RevealAnswer') return false;
  const submitted = state.submissions?.some((s) => s.playerId === playerId && s.questionId === questionId) ?? false;
  if (!submitted) return false;
  const markedWrong = state.wrongAnswers?.some((w) => w.playerId === playerId && w.questionId === questionId) ?? false;
  return !markedWrong;
}
