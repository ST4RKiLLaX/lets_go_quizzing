import { expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getRoom, setRoom } from '../src/lib/server/game/rooms.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import { createSocketHandlerContext, registerSocketHandlers } from '../src/lib/server/socket/handlers.js';

type DisconnectCallback = () => void;

function makeBaseState(roomId: string): GameState {
  return {
    type: 'Lobby',
    roomId,
    quiz: {
      meta: { name: 'Socket Quiz', default_timer: 30 },
      rounds: [{ name: 'Round 1', questions: [{ id: 'q1', type: 'choice', text: 'Q', options: ['A', 'B'], answer: 0 }] }],
    },
    quizFilename: 'test.yaml',
    hostSocketId: 'host-socket',
    players: new Map(),
    pendingPlayers: new Map(),
    waitingRoomEnabled: true,
    allowLateJoin: true,
    autoAdmitBeforeGame: true,
    manualAdmitAfterGame: true,
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
  };
}

function registerDisconnectForSocket(socketLike: { id: string; data: Record<string, unknown> }): DisconnectCallback {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const fakeSocket = {
    id: socketLike.id,
    data: socketLike.data,
    on: (event: string, cb: (...args: unknown[]) => void) => {
      handlers.set(event, cb);
      return fakeSocket;
    },
  };
  const fakeIo = {
    in: () => ({
      fetchSockets: async () => [],
    }),
  };
  registerSocketHandlers(createSocketHandlerContext(fakeIo as never, fakeSocket as never));
  const disconnect = handlers.get('disconnect');
  if (!disconnect) throw new Error('disconnect handler not registered');
  return () => disconnect();
}

test('disconnect clears socketId for connected player in room', () => {
  const roomId = `ROOM_${randomUUID().slice(0, 8)}`;
  const playerId = 'p1';
  const state = makeBaseState(roomId);
  state.players.set(playerId, {
    id: playerId,
    name: 'Ana',
    emoji: '😀',
    score: 10,
    totalAnswerTimeMs: 2000,
    socketId: 'player-socket-1',
  });
  setRoom(roomId, state);

  const disconnect = registerDisconnectForSocket({
    id: 'player-socket-1',
    data: { role: 'player', roomId, playerId },
  });
  disconnect();

  const updated = getRoom(roomId);
  expect(updated?.players.get(playerId)?.socketId).toBeUndefined();
});

test('disconnect removes matching pending player by socket id', () => {
  const roomId = `ROOM_${randomUUID().slice(0, 8)}`;
  const state = makeBaseState(roomId);
  state.pendingPlayers = new Map([
    [
      'pending-1',
      {
        playerId: 'pending-1',
        name: 'Pat',
        emoji: '😎',
        socketId: 'pending-socket-1',
        requestedAt: Date.now(),
      },
    ],
  ]);
  setRoom(roomId, state);

  const disconnect = registerDisconnectForSocket({
    id: 'pending-socket-1',
    data: {},
  });
  disconnect();

  const updated = getRoom(roomId);
  expect(updated?.pendingPlayers.has('pending-1')).toBe(false);
});
