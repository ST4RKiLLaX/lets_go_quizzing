import { getOptionCounts } from '$lib/player/question-helpers.js';
import type {
  SerializedQuestionPatch,
  SerializedState,
  SerializedSubmission,
} from '$lib/types/game.js';
import type { Question } from '$lib/types/quiz.js';

export function getRevealHotspotSubmissions(submissions: SerializedSubmission[], questionId: string): SerializedSubmission[] {
  return submissions.filter(
    (submission) =>
      submission.questionId === questionId &&
      submission.answerX != null &&
      submission.answerY != null &&
      submission.visibility !== 'blocked' &&
      !submission.projectorHiddenByHost
  );
}

export function getLiveSubmittedCount(params: {
  state: SerializedState | null;
  currentQuestionId: string | undefined;
  questionPatch: SerializedQuestionPatch | null;
}): number {
  const { state, currentQuestionId, questionPatch } = params;
  if (!currentQuestionId) return 0;
  if (state?.type === 'Question' && questionPatch?.questionId === currentQuestionId) {
    return questionPatch.submittedCount;
  }
  return (state?.submissions ?? []).filter((submission) => submission.questionId === currentQuestionId).length;
}

export function getLiveOptionCounts(params: {
  state: SerializedState | null;
  currentQuestionId: string | undefined;
  questionPatch: SerializedQuestionPatch | null;
}): Map<number, number> {
  const { state, currentQuestionId, questionPatch } = params;
  if (
    currentQuestionId &&
    state?.type === 'Question' &&
    questionPatch?.questionId === currentQuestionId &&
    questionPatch.optionCounts
  ) {
    return new Map(Object.entries(questionPatch.optionCounts).map(([index, count]) => [Number(index), count]));
  }
  return getOptionCounts(state?.submissions ?? [], currentQuestionId ?? '');
}

export function getLiveHotspotSubmissions(params: {
  state: SerializedState | null;
  currentQuestion: Question | null;
  questionPatch: SerializedQuestionPatch | null;
}): SerializedSubmission[] | Array<{ playerId: string; answerX: number; answerY: number }> {
  const { state, currentQuestion, questionPatch } = params;
  if (currentQuestion?.type !== 'hotspot') return [];
  if (state?.type === 'RevealAnswer') {
    return getRevealHotspotSubmissions(state?.submissions ?? [], currentQuestion.id);
  }
  if (state?.type === 'Question' && questionPatch?.questionId === currentQuestion.id) {
    return questionPatch.hotspotSubmissions ?? [];
  }
  return getRevealHotspotSubmissions(state?.submissions ?? [], currentQuestion.id);
}
