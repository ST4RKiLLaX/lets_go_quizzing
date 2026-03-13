import type { Question } from '$lib/types/quiz.js';
import type { SerializedSubmission } from '$lib/types/game.js';

/**
 * Returns option labels for question types that have discrete options.
 * Returns [] for hotspot, input, open_ended, word_cloud (no options).
 */
export function getQuestionOptions(q: Question): string[] {
  if (q.type === 'true_false') return ['True', 'False'];
  if (q.type === 'choice' || q.type === 'poll' || q.type === 'multi_select' || q.type === 'reorder' || q.type === 'matching') {
    return q.options;
  }
  return [];
}

/**
 * Builds a map of optionIndex -> count from submissions for a question.
 */
export function getOptionCounts(
  submissions: SerializedSubmission[],
  questionId: string
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const submission of submissions) {
    if (submission.questionId !== questionId) continue;
    if (submission.answerIndex != null) {
      counts.set(submission.answerIndex, (counts.get(submission.answerIndex) ?? 0) + 1);
    }
    if (submission.answerIndexes?.length) {
      for (const answerIndex of submission.answerIndexes) {
        counts.set(answerIndex, (counts.get(answerIndex) ?? 0) + 1);
      }
    }
  }
  return counts;
}
