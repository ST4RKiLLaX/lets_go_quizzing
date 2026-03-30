import { expect, test } from 'vitest';
import { QuizSchema, type Quiz } from '../src/lib/schema/quiz.js';
import { getQuestionDisplayOptionIndices, getShuffledReorderIndices } from '../src/lib/utils/shuffle.js';

test('choice questions keep authored order unless shuffle_options is enabled', () => {
  const quiz = QuizSchema.parse({
    meta: { name: 'Shuffle Quiz' },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'choice-1',
            type: 'choice',
            text: 'Pick one',
            options: ['A', 'B', 'C'],
            answer: 1,
          },
          {
            id: 'choice-2',
            type: 'choice',
            text: 'Pick one',
            shuffle_options: true,
            options: ['A', 'B', 'C'],
            answer: 1,
          },
        ],
      },
    ],
  } satisfies Quiz);

  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[0]!)).toEqual([0, 1, 2]);
  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[1]!)).toEqual(
    getShuffledReorderIndices('choice-2', 3)
  );
  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[1]!, 'ROOM1')).toEqual(
    getShuffledReorderIndices('ROOM1:choice-2', 3)
  );
});

test('matching and reorder preserve current shuffled behavior when shuffle_options is omitted', () => {
  const quiz = QuizSchema.parse({
    meta: { name: 'Legacy Shuffle Quiz' },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'match-1',
            type: 'matching',
            text: 'Match items',
            items: ['A', 'B'],
            options: ['One', 'Two', 'Three'],
            answer: [0, 1],
          },
          {
            id: 'reorder-1',
            type: 'reorder',
            text: 'Order items',
            options: ['One', 'Two', 'Three'],
            answer: [2, 0, 1],
          },
        ],
      },
    ],
  } satisfies Quiz);

  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[0]!)).toEqual(
    getShuffledReorderIndices('match-1:options', 3)
  );
  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[1]!)).toEqual(
    getShuffledReorderIndices('reorder-1', 3)
  );
});

test('matching and reorder can disable shuffling explicitly', () => {
  const quiz = QuizSchema.parse({
    meta: { name: 'No Shuffle Quiz' },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'match-2',
            type: 'matching',
            text: 'Match items',
            shuffle_options: false,
            items: ['A', 'B'],
            options: ['One', 'Two', 'Three'],
            answer: [0, 1],
          },
          {
            id: 'reorder-2',
            type: 'reorder',
            text: 'Order items',
            shuffle_options: false,
            options: ['One', 'Two', 'Three'],
            answer: [2, 0, 1],
          },
        ],
      },
    ],
  } satisfies Quiz);

  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[0]!)).toEqual([0, 1, 2]);
  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[1]!)).toEqual([0, 1, 2]);
});

test('multi-select and poll use deterministic shuffled display order when enabled', () => {
  const quiz = QuizSchema.parse({
    meta: { name: 'Display Order Quiz' },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'multi-1',
            type: 'multi_select',
            text: 'Choose many',
            shuffle_options: true,
            options: ['A', 'B', 'C', 'D'],
            answer: [0, 2],
          },
          {
            id: 'poll-1',
            type: 'poll',
            text: 'Vote',
            shuffle_options: true,
            options: ['A', 'B', 'C', 'D'],
          },
        ],
      },
    ],
  } satisfies Quiz);

  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[0]!)).toEqual(
    getShuffledReorderIndices('multi-1', 4)
  );
  expect(getQuestionDisplayOptionIndices(quiz.rounds[0].questions[1]!)).toEqual(
    getShuffledReorderIndices('poll-1', 4)
  );
});

test('room-scoped shuffles are stable within a room', () => {
  const quiz = QuizSchema.parse({
    meta: { name: 'Room Shuffle Quiz' },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'choice-room-1',
            type: 'choice',
            text: 'Pick one',
            shuffle_options: true,
            options: ['A', 'B', 'C', 'D'],
            answer: 2,
          },
        ],
      },
    ],
  } satisfies Quiz);

  const question = quiz.rounds[0].questions[0]!;

  expect(getQuestionDisplayOptionIndices(question, 'ROOM_A')).toEqual(
    getShuffledReorderIndices('ROOM_A:choice-room-1', 4)
  );
  expect(getQuestionDisplayOptionIndices(question, 'ROOM_A')).toEqual(
    getQuestionDisplayOptionIndices(question, 'ROOM_A')
  );
  expect(getQuestionDisplayOptionIndices(question, 'ROOM_B')).toEqual(
    getShuffledReorderIndices('ROOM_B:choice-room-1', 4)
  );
});
