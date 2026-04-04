import { test, expect } from 'vitest';
import { compareTwoStrings } from '../src/lib/server/game/diceBigramCompare.js';
import { scoreSubmissions } from '../src/lib/server/game/scoring.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import type { InputQuestion, Quiz } from '../src/lib/server/storage/parser.js';

test('compareTwoStrings matches string-similarity@4.0.4 golden values', () => {
  const cases: [string, string, number][] = [
    ['hello', 'hello', 1],
    ['hello', 'helo', 0.8571428571428571],
    ['night', 'nacht', 0.25],
    ['a', 'a', 1],
    ['a', 'b', 0],
    ['ab', 'ab', 1],
    ['test', 't e s t', 1],
    ['', '', 1],
    ['x', 'xx', 0],
    ['healed', 'sealed', 0.8],
  ];
  for (const [a, b, expected] of cases) {
    expect(compareTwoStrings(a, b)).toBe(expected);
  }
});

function makeInputQuiz(answer: string[], fuzzy_threshold?: number): Quiz {
  const inputQ: InputQuestion = {
    id: 'q1',
    type: 'input',
    text: 'Type it',
    answer,
  };
  return {
    meta: {
      name: 'T',
      default_timer: 30,
      ...(fuzzy_threshold !== undefined ? { fuzzy_threshold } : {}),
    },
    rounds: [{ name: 'R1', questions: [inputQ] }],
  };
}

function baseState(overrides: Partial<GameState> & { quiz: Quiz }): GameState {
  const { quiz, ...rest } = overrides;
  return {
    type: 'RevealAnswer',
    roomId: 'ROOM',
    quiz,
    quizFilename: 't.yaml',
    hostSocketId: 'host',
    players: new Map([
      ['p1', { id: 'p1', name: 'One', emoji: '🙂', score: 0 }],
      ['p2', { id: 'p2', name: 'Two', emoji: '🙂', score: 0 }],
    ]),
    pendingPlayers: new Map(),
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
    ...rest,
  };
}

test('scoreSubmissions: fuzzy input accepts helo vs hello at default threshold', () => {
  const quiz = makeInputQuiz(['hello']);
  const state = baseState({
    quiz,
    submissions: [
      {
        playerId: 'p1',
        questionId: 'q1',
        answerText: 'helo',
        submittedAt: 1,
      },
    ],
  });
  const next = scoreSubmissions(state, 1);
  expect(next.players.get('p1')!.score).toBe(1);
  expect(next.wrongAnswers).toHaveLength(0);
});

test('scoreSubmissions: fuzzy input rejects sealed vs healed at default threshold', () => {
  const quiz = makeInputQuiz(['healed']);
  const state = baseState({
    quiz,
    submissions: [
      {
        playerId: 'p1',
        questionId: 'q1',
        answerText: 'sealed',
        submittedAt: 1,
      },
    ],
  });
  const next = scoreSubmissions(state, 1);
  expect(next.players.get('p1')!.score).toBe(0);
  expect(next.wrongAnswers.some((w) => w.playerId === 'p1')).toBe(true);
});

test('scoreSubmissions: fuzzy input accepts sealed vs healed when threshold lowered', () => {
  const quiz = makeInputQuiz(['healed'], 0.79);
  const state = baseState({
    quiz,
    submissions: [
      {
        playerId: 'p1',
        questionId: 'q1',
        answerText: 'sealed',
        submittedAt: 1,
      },
    ],
  });
  const next = scoreSubmissions(state, 1);
  expect(next.players.get('p1')!.score).toBe(1);
  expect(next.wrongAnswers).toHaveLength(0);
});
