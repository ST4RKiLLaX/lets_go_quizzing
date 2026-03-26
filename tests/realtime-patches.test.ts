import { expect, test } from 'vitest';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import { serializeQuestionPatch, serializeRoomPatch } from '../src/lib/server/socket/serializers.js';
import type { Quiz } from '../src/lib/server/storage/parser.js';

function makeChoiceQuiz(): Quiz {
  return {
    meta: { name: 'Choice Quiz', default_timer: 30 },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'q1',
            type: 'multi_select',
            text: 'Pick answers',
            options: ['A', 'B', 'C'],
            answer: [0, 2],
          },
        ],
      },
    ],
  };
}

function makeHotspotQuiz(): Quiz {
  return {
    meta: { name: 'Hotspot Quiz', default_timer: 30 },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'hot-1',
            type: 'hotspot',
            text: 'Tap the right spot',
            image: 'hotspot.png',
            answer: { x: 0.5, y: 0.5, radius: 0.1 },
          },
        ],
      },
    ],
  };
}

function makeState(overrides: Partial<GameState> & { quiz: Quiz }): GameState {
  return {
    type: 'Lobby',
    roomId: 'ROOM1',
    quizFilename: 'test.yaml',
    hostSocketId: 'host-socket',
    players: new Map(),
    pendingPlayers: new Map(),
    waitingRoomEnabled: false,
    allowLateJoin: false,
    autoAdmitBeforeGame: true,
    manualAdmitAfterGame: true,
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
    ...overrides,
  };
}

test('serializeRoomPatch keeps pending players host-only', () => {
  const players = new Map([
    ['p1', { id: 'p1', name: 'Ana', emoji: '😀', score: 10, socketId: 'sock-1' }],
  ]);
  const pendingPlayers = new Map([
    ['p2', { playerId: 'p2', socketId: 'sock-2', name: 'Ben', emoji: '🔥', requestedAt: 123 }],
  ]);
  const state = makeState({ quiz: makeChoiceQuiz(), players, pendingPlayers });

  const hostPatch = serializeRoomPatch(state, { forHost: true });
  const playerPatch = serializeRoomPatch(state, { forHost: false });

  expect(hostPatch.players).toHaveLength(1);
  expect(hostPatch.pendingPlayers).toEqual([
    { playerId: 'p2', socketId: 'sock-2', name: 'Ben', emoji: '🔥', requestedAt: 123 },
  ]);
  expect(playerPatch.pendingPlayers).toBeUndefined();
});

test('serializeQuestionPatch returns live counts for host multi-select updates', () => {
  const state = makeState({
    quiz: makeChoiceQuiz(),
    type: 'Question',
    submissions: [
      { playerId: 'p1', questionId: 'q1', answerIndexes: [0, 2], submittedAt: 1 },
      { playerId: 'p2', questionId: 'q1', answerIndexes: [2], submittedAt: 2 },
    ],
  });

  const patch = serializeQuestionPatch(state, 'host');

  expect(patch).toMatchObject({
    roomId: 'ROOM1',
    type: 'Question',
    questionId: 'q1',
    submittedCount: 2,
    answeredPlayerIds: ['p1', 'p2'],
    optionCounts: { '0': 1, '2': 2 },
  });
});

test('serializeQuestionPatch keeps projector question patches narrow', () => {
  const state = makeState({
    quiz: makeHotspotQuiz(),
    type: 'Question',
    submissions: [
      { playerId: 'p1', questionId: 'hot-1', answerX: 10, answerY: 20, submittedAt: 1 },
      {
        playerId: 'p2',
        questionId: 'hot-1',
        answerX: 30,
        answerY: 40,
        submittedAt: 2,
        projectorHiddenByHost: true,
      },
    ],
  });

  const hostPatch = serializeQuestionPatch(state, 'host');
  const projectorPatch = serializeQuestionPatch(state, 'projector');

  expect(hostPatch?.hotspotSubmissions).toEqual([{ playerId: 'p1', answerX: 10, answerY: 20 }]);
  expect(projectorPatch).toMatchObject({
    roomId: 'ROOM1',
    type: 'Question',
    questionId: 'hot-1',
    submittedCount: 2,
    answeredPlayerIds: ['p1', 'p2'],
  });
  expect(projectorPatch?.hotspotSubmissions).toBeUndefined();
  expect(projectorPatch?.optionCounts).toBeUndefined();
});
