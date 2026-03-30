/**
 * Pure immutable quiz editor actions.
 *
 * Invariants:
 * - Never mutate the input `quiz`; always return a new object.
 * - Preserve existing `question.id` unless intentionally creating a new item.
 * - When `setQuestionType` runs, preserve shared fields only: id, text, explanation, image, points;
 *   always normalize answer shape for the new type; new type-specific fields must be initialized
 *   to valid defaults, not left undefined unless the schema allows it.
 * - Keep option arrays and answer indices valid after remove operations (no out-of-bounds indices).
 */

import type {
  Quiz,
  Question,
  ChoiceQuestion,
  PollQuestion,
  MultiSelectQuestion,
  SliderQuestion,
  InputQuestion,
  ReorderQuestion,
  HotspotQuestion,
  MatchingQuestion,
} from '$lib/types/quiz.js';
import { createEmptyChoiceQuestion, generateQuestionId } from '$lib/types/quiz.js';

export type QuestionType =
  | 'choice'
  | 'true_false'
  | 'poll'
  | 'multi_select'
  | 'slider'
  | 'input'
  | 'open_ended'
  | 'word_cloud'
  | 'reorder'
  | 'matching'
  | 'hotspot';

export function addRound(quiz: Quiz): Quiz {
  return {
    ...quiz,
    rounds: [
      ...quiz.rounds,
      {
        name: `Round ${quiz.rounds.length + 1}`,
        questions: [createEmptyChoiceQuestion(generateQuestionId(quiz.rounds.length, 0))],
      },
    ],
  };
}

export function removeRound(quiz: Quiz, ri: number): Quiz {
  if (quiz.rounds.length <= 1) return quiz;
  return {
    ...quiz,
    rounds: quiz.rounds.filter((_, i) => i !== ri),
  };
}

export function addQuestion(quiz: Quiz, ri: number): Quiz {
  const round = quiz.rounds[ri];
  const newQ = createEmptyChoiceQuestion(generateQuestionId(ri, round.questions.length));
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri ? { ...r, questions: [...r.questions, newQ] } : r
    ),
  };
}

export function removeQuestion(quiz: Quiz, ri: number, qi: number): Quiz {
  const round = quiz.rounds[ri];
  if (round.questions.length <= 1) return quiz;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri ? { ...r, questions: r.questions.filter((_, j) => j !== qi) } : r
    ),
  };
}

/** Swap question at qi with neighbor qi+delta. Preserves question ids (e.g. image paths). */
export function moveQuestion(
  quiz: Quiz,
  ri: number,
  qi: number,
  delta: -1 | 1
): Quiz {
  const round = quiz.rounds[ri];
  const j = qi + delta;
  if (j < 0 || j >= round.questions.length) return quiz;
  const questions = [...round.questions];
  [questions[qi], questions[j]] = [questions[j], questions[qi]];
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) => (i === ri ? { ...r, questions } : r)),
  };
}

export function setQuestionType(
  quiz: Quiz,
  ri: number,
  qi: number,
  type: QuestionType
): Quiz {
  const q = quiz.rounds[ri].questions[qi];
  if (q.type === type) return quiz;
  const base = {
    id: q.id,
    text: q.text,
    explanation: q.explanation,
    image: q.image,
    points: (q as { points?: number }).points,
    shuffle_options:
      q.type === 'choice' ||
      q.type === 'poll' ||
      q.type === 'multi_select' ||
      q.type === 'reorder' ||
      q.type === 'matching'
        ? q.shuffle_options
        : undefined,
  };
  const newQ: Question =
    type === 'choice'
      ? { ...base, type: 'choice', shuffle_options: base.shuffle_options ?? false, options: ['', ''], answer: 0 }
      : type === 'true_false'
        ? { ...base, type: 'true_false', answer: true }
        : type === 'poll'
          ? { ...base, type: 'poll', shuffle_options: base.shuffle_options ?? false, options: ['', ''] }
          : type === 'multi_select'
            ? { ...base, type: 'multi_select', shuffle_options: base.shuffle_options ?? false, options: ['', ''], answer: [0] }
            : type === 'slider'
              ? { ...base, type: 'slider', min: 0, max: 10, step: 1, answer: 5 }
              : type === 'input'
                ? { ...base, type: 'input', answer: [''] }
                : type === 'open_ended'
                  ? { ...base, type: 'open_ended' }
                  : type === 'word_cloud'
                    ? { ...base, type: 'word_cloud' }
                    : type === 'reorder'
                      ? { ...base, type: 'reorder', shuffle_options: base.shuffle_options ?? true, options: ['', ''], answer: [0, 1] }
                      : type === 'matching'
                        ? {
                            ...base,
                            type: 'matching',
                            shuffle_options: base.shuffle_options ?? true,
                            items: ['', ''],
                            options: ['', '', '', ''],
                            answer: [0, 1],
                          }
                        : {
                            ...base,
                            type: 'hotspot',
                            image: (base.image as string) ?? '',
                            answer: { x: 0.5, y: 0.5, radius: 0.1 },
                          };
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? newQ : qu)) } : r
    ),
  };
}

export function addOption(quiz: Quiz, ri: number, qi: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as
    | ChoiceQuestion
    | PollQuestion
    | MultiSelectQuestion
    | ReorderQuestion;
  if (
    q.type !== 'choice' &&
    q.type !== 'poll' &&
    q.type !== 'multi_select' &&
    q.type !== 'reorder'
  )
    return quiz;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) => {
              if (j !== qi) return qu;
              if (q.type === 'reorder') {
                return {
                  ...q,
                  options: [...q.options, ''],
                  answer: [...q.answer, q.options.length],
                } as ReorderQuestion;
              }
              return { ...q, options: [...q.options, ''] } as Question;
            }),
          }
        : r
    ),
  };
}

export function removeOption(quiz: Quiz, ri: number, qi: number, oi: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as
    | ChoiceQuestion
    | PollQuestion
    | MultiSelectQuestion
    | ReorderQuestion;
  if (
    (q.type !== 'choice' &&
      q.type !== 'poll' &&
      q.type !== 'multi_select' &&
      q.type !== 'reorder') ||
    q.options.length <= 2
  )
    return quiz;
  const newOptions = q.options.filter((_: string, i: number) => i !== oi);
  const newAnswer =
    q.type === 'choice' ? Math.min(q.answer, newOptions.length - 1) : undefined;
  const newMultiSelectAnswer =
    q.type === 'multi_select'
      ? q.answer
          .filter((index: number) => index !== oi)
          .map((index: number) => (index > oi ? index - 1 : index))
      : undefined;
  const newReorderAnswer =
    q.type === 'reorder'
      ? q.answer
          .filter((index: number) => index !== oi)
          .map((index: number) => (index > oi ? index - 1 : index))
      : undefined;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) =>
              j === qi
                ? q.type === 'choice'
                  ? { ...q, options: newOptions, answer: newAnswer! }
                  : q.type === 'multi_select'
                    ? {
                        ...q,
                        options: newOptions,
                        answer: newMultiSelectAnswer?.length ? newMultiSelectAnswer : [0],
                      }
                    : q.type === 'reorder'
                      ? {
                          ...q,
                          options: newOptions,
                          answer: newReorderAnswer?.length ? newReorderAnswer : [0, 1],
                        }
                      : { ...q, options: newOptions }
                : qu
            ),
          }
        : r
    ),
  };
}

export function toggleMultiSelectAnswer(
  quiz: Quiz,
  ri: number,
  qi: number,
  oi: number,
  checked: boolean
): Quiz {
  const q = quiz.rounds[ri].questions[qi] as MultiSelectQuestion;
  if (q.type !== 'multi_select') return quiz;
  const answer = checked
    ? [...new Set([...q.answer, oi])].sort((a, b) => a - b)
    : q.answer.filter((index) => index !== oi);
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) =>
              j === qi ? { ...q, answer: answer.length ? answer : [oi] } : qu
            ),
          }
        : r
    ),
  };
}

export function updateSliderQuestion(
  quiz: Quiz,
  ri: number,
  qi: number,
  field: 'min' | 'max' | 'step' | 'answer',
  value: number
): Quiz {
  const q = quiz.rounds[ri].questions[qi] as SliderQuestion;
  if (q.type !== 'slider') return quiz;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) =>
              j === qi ? { ...q, [field]: value } : qu
            ),
          }
        : r
    ),
  };
}

export function addInputAnswer(quiz: Quiz, ri: number, qi: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as InputQuestion;
  if (q.type !== 'input') return quiz;
  const current = Array.isArray(q.answer) ? q.answer : [''];
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) =>
              j === qi ? { ...q, answer: [...current, ''] } : qu
            ),
          }
        : r
    ),
  };
}

export function removeInputAnswer(quiz: Quiz, ri: number, qi: number, ai: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as InputQuestion;
  if (q.type !== 'input' || q.answer.length <= 1) return quiz;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) =>
              j === qi ? { ...q, answer: q.answer.filter((_: string, k: number) => k !== ai) } : qu
            ),
          }
        : r
    ),
  };
}

export function updateQuestionField(
  quiz: Quiz,
  ri: number,
  qi: number,
  patch: Partial<Question>
): Quiz {
  const q = quiz.rounds[ri].questions[qi];
  const updated = { ...q, ...patch } as Question;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) => (j === qi ? updated : qu)),
          }
        : r
    ),
  };
}

export function updateQuestion(
  quiz: Quiz,
  ri: number,
  qi: number,
  fn: (q: Question) => Question
): Quiz {
  const q = quiz.rounds[ri].questions[qi];
  const updated = fn(q);
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) => (j === qi ? updated : qu)),
          }
        : r
    ),
  };
}

export function updateHotspotAnswer(
  quiz: Quiz,
  ri: number,
  qi: number,
  patch: Partial<HotspotQuestion['answer']>
): Quiz {
  const q = quiz.rounds[ri].questions[qi] as HotspotQuestion;
  if (q.type !== 'hotspot') return quiz;
  return updateQuestionField(quiz, ri, qi, {
    answer: { ...q.answer, ...patch },
  } as Partial<Question>);
}

export function setHotspotImageAspectRatio(quiz: Quiz, ri: number, qi: number, ar: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as HotspotQuestion;
  if (q.type !== 'hotspot') return quiz;
  if (q.imageAspectRatio !== undefined && Math.abs(q.imageAspectRatio - ar) <= 0.001) return quiz;
  return updateQuestionField(quiz, ri, qi, { imageAspectRatio: ar } as Partial<Question>);
}

export function addMatchingItem(quiz: Quiz, ri: number, qi: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as MatchingQuestion;
  if (q.type !== 'matching') return quiz;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) =>
              j === qi
                ? { ...q, items: [...q.items, ''], answer: [...q.answer, 0] }
                : qu
            ),
          }
        : r
    ),
  };
}

export function removeMatchingItem(quiz: Quiz, ri: number, qi: number, ii: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as MatchingQuestion;
  if (q.type !== 'matching' || q.items.length <= 2) return quiz;
  const newItems = q.items.filter((_, i) => i !== ii);
  const newAnswer = q.answer.filter((_, i) => i !== ii);
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...q, items: newItems, answer: newAnswer } : qu)) }
        : r
    ),
  };
}

export function addMatchingOption(quiz: Quiz, ri: number, qi: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as MatchingQuestion;
  if (q.type !== 'matching') return quiz;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...q, options: [...q.options, ''] } : qu)) }
        : r
    ),
  };
}

export function removeMatchingOption(quiz: Quiz, ri: number, qi: number, oi: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as MatchingQuestion;
  if (q.type !== 'matching' || q.options.length <= 2) return quiz;
  const newOptions = q.options.filter((_, i) => i !== oi);
  const newAnswer = q.answer
    .map((idx) => (idx === oi ? 0 : idx > oi ? idx - 1 : idx))
    .map((idx, i) => Math.min(idx, newOptions.length - 1));
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...q, options: newOptions, answer: newAnswer } : qu)) }
        : r
    ),
  };
}

export function setMatchingAnswer(quiz: Quiz, ri: number, qi: number, itemIndex: number, optionIndex: number): Quiz {
  const q = quiz.rounds[ri].questions[qi] as MatchingQuestion;
  if (q.type !== 'matching' || itemIndex < 0 || itemIndex >= q.items.length) return quiz;
  if (optionIndex < 0 || optionIndex >= q.options.length) return quiz;
  const newAnswer = [...q.answer];
  newAnswer[itemIndex] = optionIndex;
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...q, answer: newAnswer } : qu)) }
        : r
    ),
  };
}

export function clearImage(quiz: Quiz, ri: number, qi: number): Quiz {
  return {
    ...quiz,
    rounds: quiz.rounds.map((r, i) =>
      i === ri
        ? {
            ...r,
            questions: r.questions.map((qu, j) => {
              if (j !== qi) return qu;
              if (qu.type === 'hotspot') return { ...qu, image: '' };
              return { ...qu, image: undefined };
            }),
          }
        : r
    ),
  };
}
