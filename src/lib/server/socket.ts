import { Server } from 'socket.io';
import type { IncomingMessage } from 'http';
import {
  createRoom,
  getRoom,
  setRoom,
  roomExists,
} from './game/rooms.js';
import {
  transition,
  createInitialState,
  type GameState,
  type GameEvent,
} from './game/state-machine.js';
import { scoreSubmissions } from './game/scoring.js';
import { loadQuiz } from './storage/parser.js';
import { isAuthenticated, requireHostPassword, verifyPasswordConstantTime } from './auth.js';
import { getClientAddressFromSocket } from './address.js';
import {
  checkPlayerJoinRateLimit,
  checkHostCreateRateLimit,
  checkHostJoinRateLimit,
  checkHostGetStateRateLimit,
} from './rate-limit.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = 'data';
const PLAYER_ID_KEY = 'lgq_player_id';

export function initSocket(httpServer: import('http').Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === 'production'
          ? (process.env.ORIGIN ?? 'https://localhost:3000')
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('host:create', (payload: { quizFilename: string; password?: string }, ack) => {
      const { quizFilename, password } = payload ?? {};
      if (!quizFilename) {
        ack?.({ error: 'quizFilename required' });
        return;
      }
      if (!requireHostPassword()) {
        ack?.({ error: 'Hosting disabled' });
        return;
      }
      if (!checkHostCreateRateLimit(getClientAddressFromSocket(socket))) {
        ack?.({ error: 'Too many attempts' });
        return;
      }
      const hasValidCookie = isAuthenticated(socket.handshake.headers.cookie);
      const hostPwd = process.env.HOST_PASSWORD;
      const hasValidPassword =
        password && hostPwd && verifyPasswordConstantTime(password, hostPwd);
      if (!hasValidCookie && !hasValidPassword) {
        console.warn(`[auth] host:create auth failed from ${getClientAddressFromSocket(socket)}`);
        ack?.({ error: 'Invalid password' });
        return;
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
      if (!checkPlayerJoinRateLimit(getClientAddressFromSocket(socket))) {
        ack?.({ error: 'Too many attempts' });
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

    socket.on('host:join', (payload: { roomId: string; password?: string }, ack) => {
      const { roomId, password } = payload ?? {};
      if (!roomId) {
        ack?.({ error: 'roomId required' });
        return;
      }
      if (!roomExists(roomId)) {
        ack?.({ error: 'Room not found' });
        return;
      }
      if (!requireHostPassword()) {
        ack?.({ error: 'Hosting disabled' });
        return;
      }
      if (!checkHostJoinRateLimit(getClientAddressFromSocket(socket))) {
        ack?.({ error: 'Too many attempts' });
        return;
      }
      const hasValidCookie = isAuthenticated(socket.handshake.headers.cookie);
      const hostPwd = process.env.HOST_PASSWORD;
      const hasValidPassword = password && hostPwd && verifyPasswordConstantTime(password, hostPwd);
      if (!hasValidCookie && !hasValidPassword) {
        console.warn(`[auth] host:join auth failed from ${getClientAddressFromSocket(socket)}`);
        ack?.({ error: 'Invalid password' });
        return;
      }
      socket.join(roomId);
      socket.data.role = 'host';
      socket.data.roomId = roomId;
      const state = getRoom(roomId)!;
      ack?.({ state: serializeState(state) });
    });

    socket.on('host:get_state', (payload: { roomId: string }, ack) => {
      const roomId = payload?.roomId ?? socket.data.roomId;
      if (!roomId) {
        ack?.({ error: 'roomId required' });
        return;
      }
      if (!checkHostGetStateRateLimit(getClientAddressFromSocket(socket))) {
        ack?.({ error: 'Too many attempts' });
        return;
      }
      if (socket.data.role !== 'host' || socket.data.roomId !== roomId) {
        ack?.({ error: 'Unauthorized' });
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
      // Score when transitioning TO RevealAnswer (answer displayed), not when leaving it
      if (state.type === 'Question') {
        state = scoreSubmissions(state);
        setRoom(roomId, state);
      }
      const next = transition(state, { type: 'NEXT' });
      setRoom(roomId, next);
      if (next.type === 'End') {
        saveHistory(next);
      }
      ack?.({ ok: true });
      const serialized = serializeState(next);
      io.to(roomId).emit('state:update', { state: serialized });
      socket.emit('state:update', { state: serialized });
    });

    socket.on('host:stop_timer', (_, ack) => {
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
      // Score when revealing answer (Question → RevealAnswer)
      state = scoreSubmissions(state);
      setRoom(roomId, state);
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
      const serialized = serializeState(next);
      io.to(roomId).emit('room:update', { state: serialized });
      io.to(roomId).emit('state:update', { state: serialized });
      socket.emit('room:update', { state: serialized });
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
    players: Array.from(state.players.entries()).map(([id, p]) => ({ ...p, id })),
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
