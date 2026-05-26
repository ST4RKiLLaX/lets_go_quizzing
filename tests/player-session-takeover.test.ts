import { afterEach, beforeEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getRoom, setRoom } from '../src/lib/server/game/rooms.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import { createSocketHandlerContext, registerSocketHandlers } from '../src/lib/server/socket/handlers.js';

type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  emitted: Array<{ event: string; payload: unknown }>;
  disconnected: boolean;
  on: (event: string, cb: Handler) => FakeSocket;
  emit: (event: string, payload: unknown) => boolean;
  join: (room: string) => void;
  leave: (room: string) => void;
  disconnect: (close?: boolean) => void;
  handlers: Map<string, Handler>;
  handshake: { address: string; headers: Record<string, string> };
}

function makeBaseState(roomId: string): GameState {
  return {
    type: 'Lobby',
    roomId,
    quiz: {
      meta: { name: 'Takeover Quiz', default_timer: 30 },
      rounds: [{ name: 'R1', questions: [{ id: 'q1', type: 'choice', text: 'Q', options: ['A', 'B'], answer: 0 }] }],
    },
    quizFilename: 'test.yaml',
    hostSocketId: 'host-socket',
    players: new Map(),
    pendingPlayers: new Map(),
    waitingRoomEnabled: false,
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

interface FakeIo {
  sockets: { sockets: Map<string, FakeSocket> };
  in: (room: string) => { fetchSockets: () => Promise<FakeSocket[]>; emit: (event: string, payload: unknown) => void };
  to: (room: string) => { emit: (event: string, payload: unknown) => void };
}

function createFakeIo(registry: Map<string, FakeSocket>): FakeIo {
  return {
    sockets: { sockets: registry },
    in: () => ({
      fetchSockets: async () => Array.from(registry.values()),
      emit: () => {},
    }),
    to: () => ({ emit: () => {} }),
  };
}

function createFakeSocket(id: string, registry: Map<string, FakeSocket>): FakeSocket {
  const handlers = new Map<string, Handler>();
  const fake: FakeSocket = {
    id,
    data: {},
    emitted: [],
    disconnected: false,
    handlers,
    handshake: { address: '127.0.0.1', headers: {} },
    on(event, cb) {
      handlers.set(event, cb);
      return fake;
    },
    emit(event, payload) {
      fake.emitted.push({ event, payload });
      return true;
    },
    join() {},
    leave() {},
    disconnect() {
      fake.disconnected = true;
      registry.delete(fake.id);
      const cb = handlers.get('disconnect');
      if (cb) cb();
    },
  };
  registry.set(id, fake);
  return fake;
}

function registerForSocket(io: FakeIo, socket: FakeSocket): void {
  registerSocketHandlers(createSocketHandlerContext(io as never, socket as never));
}

let roomId: string;
let registry: Map<string, FakeSocket>;
let io: FakeIo;

beforeEach(() => {
  roomId = `ROOM_${randomUUID().slice(0, 8)}`;
  registry = new Map();
  io = createFakeIo(registry);
});

afterEach(() => {
  setRoom(roomId, undefined as never);
});

test('session takeover: stale socket gets session_replaced + disconnected, new socket joins', async () => {
  const state = makeBaseState(roomId);
  state.players.set('player-1', {
    id: 'player-1',
    name: 'Ana',
    emoji: '😀',
    score: 42,
    totalAnswerTimeMs: 5000,
    socketId: 'old-socket',
  });
  setRoom(roomId, state);

  const oldSocket = createFakeSocket('old-socket', registry);
  registerForSocket(io, oldSocket);

  const newSocket = createFakeSocket('new-socket', registry);
  registerForSocket(io, newSocket);

  const join = newSocket.handlers.get('player:join');
  if (!join) throw new Error('player:join not registered');

  let ackPayload: unknown;
  join({ roomId, playerId: 'player-1' }, (ack: unknown) => {
    ackPayload = ack;
  });

  expect(oldSocket.emitted.some((e) => e.event === 'player:session_replaced')).toBe(true);
  expect(oldSocket.disconnected).toBe(true);

  const updated = getRoom(roomId);
  expect(updated?.players.get('player-1')?.socketId).toBe('new-socket');
  expect(updated?.players.get('player-1')?.score).toBe(42);
  expect(updated?.players.get('player-1')?.name).toBe('Ana');
  expect((ackPayload as { state?: unknown }).state).toBeDefined();
});

test('returning player join keeps score and reuses identity after prior disconnect (no live old socket)', () => {
  const state = makeBaseState(roomId);
  state.players.set('player-2', {
    id: 'player-2',
    name: 'Bo',
    emoji: '🦊',
    score: 7,
    totalAnswerTimeMs: 1000,
    socketId: undefined,
  });
  setRoom(roomId, state);

  const newSocket = createFakeSocket('rejoin-socket', registry);
  registerForSocket(io, newSocket);

  const join = newSocket.handlers.get('player:join');
  if (!join) throw new Error('player:join not registered');

  let ackPayload: unknown;
  join({ roomId, playerId: 'player-2' }, (ack: unknown) => {
    ackPayload = ack;
  });

  const updated = getRoom(roomId);
  expect(updated?.players.get('player-2')?.socketId).toBe('rejoin-socket');
  expect(updated?.players.get('player-2')?.score).toBe(7);
  expect(updated?.players.get('player-2')?.emoji).toBe('🦊');
  expect((ackPayload as { state?: unknown }).state).toBeDefined();
});

test('pending re-attach: ALREADY_WAITING returned and socketId is updated on rejoin', () => {
  const state = makeBaseState(roomId);
  state.waitingRoomEnabled = true;
  state.autoAdmitBeforeGame = false;
  state.pendingPlayers.set('pending-1', {
    playerId: 'pending-1',
    name: 'Pat',
    emoji: '😎',
    socketId: undefined,
    requestedAt: Date.now() - 5000,
  });
  setRoom(roomId, state);

  const newSocket = createFakeSocket('pending-resocket', registry);
  registerForSocket(io, newSocket);

  const join = newSocket.handlers.get('player:join');
  if (!join) throw new Error('player:join not registered');

  let ackPayload: { ok?: boolean; code?: string } = {};
  join({ roomId, playerId: 'pending-1' }, (ack: { ok?: boolean; code?: string }) => {
    ackPayload = ack;
  });

  expect(ackPayload.ok).toBe(false);
  expect(ackPayload.code).toBe('ALREADY_WAITING');

  const updated = getRoom(roomId);
  const pending = updated?.pendingPlayers.get('pending-1');
  expect(pending?.socketId).toBe('pending-resocket');
  expect(pending?.name).toBe('Pat');
  expect(pending?.emoji).toBe('😎');
});

test('host:approve admits pending player whose socketId was cleared', () => {
  const state = makeBaseState(roomId);
  state.waitingRoomEnabled = true;
  state.pendingPlayers.set('pending-2', {
    playerId: 'pending-2',
    name: 'Quinn',
    emoji: '🐱',
    socketId: undefined,
    requestedAt: Date.now() - 1000,
  });
  setRoom(roomId, state);

  const hostSocket = createFakeSocket('host-socket', registry);
  hostSocket.data = { role: 'host', roomId };
  registerForSocket(io, hostSocket);

  const approve = hostSocket.handlers.get('host:approve');
  if (!approve) throw new Error('host:approve not registered');

  let ackPayload: { ok?: boolean; code?: string; message?: string } = {};
  approve({ playerId: 'pending-2' }, (ack: { ok?: boolean }) => {
    ackPayload = ack;
  });

  expect(ackPayload.ok).toBe(true);
  const updated = getRoom(roomId);
  expect(updated?.players.has('pending-2')).toBe(true);
  expect(updated?.players.get('pending-2')?.socketId).toBeUndefined();
  expect(updated?.pendingPlayers.has('pending-2')).toBe(false);
});
