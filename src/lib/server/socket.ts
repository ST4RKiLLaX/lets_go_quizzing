import { Server } from 'socket.io';
import type { IncomingMessage } from 'http';
import {
  createRoom,
  getRoom,
  setRoom,
  roomExists,
} from './rooms.js';
import {
  transition,
  createInitialState,
  type GameState,
  type GameEvent,
} from './state-machine.js';
import { scoreSubmissions } from './scoring.js';
import { loadQuiz } from './parser.js';
import { isAuthenticated, requireHostPassword } from './auth.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = 'data';
const PLAYER_ID_KEY = 'lgq_player_id';

export function initSocket(httpServer: import('http').Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('host:create', (payload: { quizFilename: string; password?: string }, ack) => {
      const { quizFilename, password } = payload ?? {};
      if (!quizFilename) {
        ack?.({ error: 'quizFilename required' });
        return;
      }
      if (requireHostPassword()) {
        const hasValidCookie = isAuthenticated(socket.handshake.headers.cookie);
        const hasValidPassword =
          password && password === process.env.HOST_PASSWORD;
        if (!hasValidCookie && !hasValidPassword) {
          ack?.({ error: 'Invalid password' });
          return;
        }
      }
      try {
        const roomId = createRoom(quizFilename, socket.id);
        socket.join(roomId);
        socket.data.role = 'host';
        socket.data.roomId = roomId;
        const state = getRoom(roomId)!;
        ack?.({ roomId, state: serializeState(state) });
        io.to(roomId).emit('state:update', { state: serializeState(state) });
      } catch (e) {
        ack?.({ error: String(e) });
      }
    });

    socket.on('player:join', (payload: { roomId: string; playerId?: string }, ack) => {
      const { roomId, playerId } = payload ?? {};
      if (!roomId) {
        ack?.({ error: 'roomId required' });
        return;
      }
      if (!roomExists(roomId)) {
        ack?.({ error: 'Room not found' });
        return;
      }
      const state = getRoom(roomId)!;
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = 'player';
      socket.data.playerId = playerId ?? crypto.randomUUID();
      ack?.({ roomId, playerId: socket.data.playerId, state: serializeState(state) });
      io.to(roomId).emit('room:update', { state: serializeState(state) });
    });

    socket.on('player:register', (payload: { playerId: string; name: string; emoji: string }, ack) => {
      const { playerId, name, emoji } = payload ?? {};
      const roomId = socket.data.roomId;
      if (!roomId) {
        ack?.({ error: 'Not in a room' });
        return;
      }
      const state = getRoom(roomId);
      if (!state || state.type !== 'Lobby') {
        ack?.({ error: 'Invalid state' });
        return;
      }
      const players = new Map(state.players);
      players.set(playerId, {
        id: playerId,
        name: name || 'Anonymous',
        emoji: emoji || '👤',
        score: 0,
        socketId: socket.id,
      });
      const next: GameState = { ...state, players };
      setRoom(roomId, next);
      socket.data.playerId = playerId;
      ack?.({ ok: true });
      io.to(roomId).emit('room:update', { state: serializeState(next) });
    });

    socket.on('host:get_state', (payload: { roomId: string }, ack) => {
      const roomId = payload?.roomId ?? socket.data.roomId;
      if (!roomId) {
        ack?.({ error: 'roomId required' });
        return;
      }
      const state = getRoom(roomId);
      if (!state) {
        ack?.({ error: 'Room not found' });
        return;
      }
      ack?.({ state: serializeState(state) });
    });

    socket.on('host:start', (_, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.role !== 'host') {
        ack?.({ error: 'Unauthorized' });
        return;
      }
      const state = getRoom(roomId);
      if (!state) {
        ack?.({ error: 'Room not found' });
        return;
      }
      const next = transition(state, { type: 'START_GAME' });
      setRoom(roomId, next);
      ack?.({ ok: true });
      io.to(roomId).emit('state:update', { state: serializeState(next) });
    });

    socket.on('host:next', (_, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.role !== 'host') {
        ack?.({ error: 'Unauthorized' });
        return;
      }
      let state = getRoom(roomId);
      if (!state) {
        ack?.({ error: 'Room not found' });
        return;
      }
      if (state.type === 'RevealAnswer') {
        state = scoreSubmissions(state);
        setRoom(roomId, state);
      }
      const next = transition(state, { type: 'NEXT' });
      setRoom(roomId, next);
      if (next.type === 'End') {
        saveHistory(next);
      }
      ack?.({ ok: true });
      io.to(roomId).emit('state:update', { state: serializeState(next) });
    });

    socket.on('host:stop_timer', (_, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.role !== 'host') {
        ack?.({ error: 'Unauthorized' });
        return;
      }
      const state = getRoom(roomId);
      if (!state) {
        ack?.({ error: 'Room not found' });
        return;
      }
      const next = transition(state, { type: 'STOP_TIMER' });
      setRoom(roomId, next);
      ack?.({ ok: true });
      io.to(roomId).emit('state:update', { state: serializeState(next) });
    });

    socket.on('host:show_leaderboard', (_, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.role !== 'host') {
        ack?.({ error: 'Unauthorized' });
        return;
      }
      const state = getRoom(roomId);
      if (!state) {
        ack?.({ error: 'Room not found' });
        return;
      }
      const next = transition(state, { type: 'SHOW_LEADERBOARD' });
      setRoom(roomId, next);
      ack?.({ ok: true });
      io.to(roomId).emit('state:update', { state: serializeState(next) });
    });

    socket.on('host:override', (payload: { playerId: string; questionId: string }, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.role !== 'host') {
        ack?.({ error: 'Unauthorized' });
        return;
      }
      const state = getRoom(roomId);
      if (!state) {
        ack?.({ error: 'Room not found' });
        return;
      }
      const { playerId, questionId } = payload ?? {};
      if (!playerId || !questionId) {
        ack?.({ error: 'playerId and questionId required' });
        return;
      }
      const players = new Map(state.players);
      const player = players.get(playerId);
      if (!player) {
        ack?.({ error: 'Player not found' });
        return;
      }
      players.set(playerId, { ...player, score: player.score + 1 });
      const next = { ...state, players };
      setRoom(roomId, next);
      ack?.({ ok: true });
      io.to(roomId).emit('state:update', { state: serializeState(next) });
    });

    socket.on('player:answer', (payload: { questionId: string; answerIndex?: number; answerText?: string }, ack) => {
      const roomId = socket.data.roomId;
      const playerId = socket.data.playerId;
      if (!roomId || !playerId) {
        ack?.({ error: 'Not registered' });
        return;
      }
      const state = getRoom(roomId);
      if (!state || state.type !== 'Question') {
        ack?.({ error: 'Not accepting answers' });
        return;
      }
      const { questionId, answerIndex, answerText } = payload ?? {};
      if (!questionId) {
        ack?.({ error: 'questionId required' });
        return;
      }
      const existing = state.submissions.find((s) => s.playerId === playerId && s.questionId === questionId);
      if (existing) {
        ack?.({ error: 'Already submitted' });
        return;
      }
      const submissions = [...state.submissions, {
        playerId,
        questionId,
        answerIndex,
        answerText,
        submittedAt: Date.now(),
      }];
      const next = { ...state, submissions };
      setRoom(roomId, next);
      ack?.({ ok: true });
      io.to(roomId).emit('room:update', { state: serializeState(next) });
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      const playerId = socket.data.playerId;
      if (roomId && playerId && socket.data.role === 'player') {
        const state = getRoom(roomId);
        if (state) {
          const players = new Map(state.players);
          const p = players.get(playerId);
          if (p) {
            players.set(playerId, { ...p, socketId: undefined });
            setRoom(roomId, { ...state, players });
            io.to(roomId).emit('room:update', { state: serializeState(getRoom(roomId)!) });
          }
        }
      }
    });
  });

  return io;
}

function serializeState(state: GameState) {
  return {
    ...state,
    players: Array.from(state.players.entries()).map(([id, p]) => ({ id, ...p })),
  };
}

function saveHistory(state: GameState) {
  try {
    const dir = join(process.cwd(), DATA_DIR, 'history');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date}_game_${state.roomId}.json`;
    const path = join(dir, filename);
    const data = {
      roomId: state.roomId,
      quizName: state.quiz.meta.name,
      startedAt: state.startedAt,
      endedAt: Date.now(),
      players: Array.from(state.players.values()).map((p) => ({
        name: p.name,
        emoji: p.emoji,
        score: p.score,
      })),
    };
    writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}
