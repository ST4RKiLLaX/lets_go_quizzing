import { test, expect } from 'vitest';
import {
  transition,
  createInitialState,
  type GameState,
  type GameEvent,
} from '../src/lib/server/game/state-machine.js';
import type { Quiz } from '../src/lib/server/storage/parser.js';

function makeQuiz(rounds: { questions: Array<{ id: string }> }[], defaultTimer = 30): Quiz {
  return {
    meta: { name: 'Test Quiz', default_timer: defaultTimer },
    rounds: rounds.map((r, ri) => ({
      name: `Round ${ri + 1}`,
      questions: r.questions.map((q, qi) => ({
        id: q.id,
        type: 'choice' as const,
        text: 'Q',
        options: ['A', 'B'],
        answer: 0,
      })),
    })),
  };
}

function makeState(overrides: Partial<GameState> & { quiz: Quiz }): GameState {
  const quiz = overrides.quiz;
  const base: GameState = {
    type: 'Lobby',
    roomId: 'TEST',
    quiz,
    quizFilename: 'test.yaml',
    hostSocketId: 'host1',
    players: new Map(),
    pendingPlayers: new Map(),
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
  };
  return { ...base, ...overrides };
}

test('START_GAME: Lobby -> QuestionPreview (no timer)', () => {
  const quiz = makeQuiz([{ questions: [{ id: 'q1' }] }]);
  const lobby = makeState({ quiz });
  const next = transition(lobby, { type: 'START_GAME' });
  expect(next.type).toBe('QuestionPreview');
  expect(next.timerEndsAt).toBeUndefined();
  expect(next.currentRoundIndex).toBe(0);
  expect(next.currentQuestionIndex).toBe(0);
});

test('START_QUESTION: QuestionPreview -> Question (sets timer)', () => {
  const quiz = makeQuiz([{ questions: [{ id: 'q1' }] }], 45);
  const preview = makeState({
    quiz,
    type: 'QuestionPreview',
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
  });
  const before = Date.now();
  const next = transition(preview, { type: 'START_QUESTION' });
  const after = Date.now();
  expect(next.type).toBe('Question');
  expect(next.timerEndsAt).toBeDefined();
  expect(next.timerEndsAt!).toBeGreaterThanOrEqual(before + 45 * 1000);
  expect(next.timerEndsAt!).toBeLessThanOrEqual(after + 45 * 1000);
});

test('RevealAnswer + NEXT -> QuestionPreview when next question exists', () => {
  const quiz = makeQuiz([{ questions: [{ id: 'q1' }, { id: 'q2' }] }]);
  const reveal = makeState({
    quiz,
    type: 'RevealAnswer',
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
  });
  const next = transition(reveal, { type: 'NEXT' });
  expect(next.type).toBe('QuestionPreview');
  expect(next.currentQuestionIndex).toBe(1);
  expect(next.timerEndsAt).toBeUndefined();
});

test('RevealAnswer + NEXT -> Scoreboard when no next question', () => {
  const quiz = makeQuiz([{ questions: [{ id: 'q1' }] }]);
  const reveal = makeState({
    quiz,
    type: 'RevealAnswer',
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
  });
  const next = transition(reveal, { type: 'NEXT' });
  expect(next.type).toBe('Scoreboard');
});

test('Scoreboard + NEXT -> QuestionPreview when next round exists', () => {
  const quiz = makeQuiz([
    { questions: [{ id: 'q1' }] },
    { questions: [{ id: 'q2' }] },
  ]);
  const scoreboard = makeState({
    quiz,
    type: 'Scoreboard',
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
  });
  const next = transition(scoreboard, { type: 'NEXT' });
  expect(next.type).toBe('QuestionPreview');
  expect(next.currentRoundIndex).toBe(1);
  expect(next.currentQuestionIndex).toBe(0);
  expect(next.timerEndsAt).toBeUndefined();
});

test('Scoreboard + NEXT -> End when no next round', () => {
  const quiz = makeQuiz([{ questions: [{ id: 'q1' }] }]);
  const scoreboard = makeState({
    quiz,
    type: 'Scoreboard',
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
  });
  const next = transition(scoreboard, { type: 'NEXT' });
  expect(next.type).toBe('End');
});

test('full flow: Lobby -> QuestionPreview -> Question -> RevealAnswer -> QuestionPreview', () => {
  const quiz = makeQuiz([{ questions: [{ id: 'q1' }, { id: 'q2' }] }], 10);
  let s = makeState({ quiz });

  s = transition(s, { type: 'START_GAME' });
  expect(s.type).toBe('QuestionPreview');
  expect(s.timerEndsAt).toBeUndefined();

  s = transition(s, { type: 'START_QUESTION' });
  expect(s.type).toBe('Question');
  expect(s.timerEndsAt).toBeDefined();

  s = transition(s, { type: 'NEXT' });
  expect(s.type).toBe('RevealAnswer');

  s = transition(s, { type: 'NEXT' });
  expect(s.type).toBe('QuestionPreview');
  expect(s.currentQuestionIndex).toBe(1);
  expect(s.timerEndsAt).toBeUndefined();

  s = transition(s, { type: 'START_QUESTION' });
  expect(s.type).toBe('Question');
  expect(s.timerEndsAt).toBeDefined();
});
