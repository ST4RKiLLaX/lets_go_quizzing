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
import { isAuthenticated, requireHostAuth, verifyWithEnvOrConfig, verifyPasswordConstantTime } from './auth/index.js';
import { hasValidOperationalConfig, getEffectiveOrigin, getProfanityFilterMode, getCustomKeywordFilterEnabled } from './config.js';
import { containsProfanityAggressive } from './profanity.js';
import { containsCustomBlockedTerm } from './custom-block.js';
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

function logHostAuthFailure(
  event: 'host:create' | 'host:join',
  socket: import('socket.io').Socket,
  hasValidCookie: boolean,
  hasValidPassword: boolean
) {
  console.warn('[auth] host auth failed', {
    event,
    socketId: socket.id,
    clientAddress: getClientAddressFromSocket(socket),
    hasValidCookie,
    hasValidPassword,
  });
}

function getCorsOrigin(): boolean | string | string[] | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void) {
  return (reqOrigin: string, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!hasValidOperationalConfig()) {
      callback(null, true);
      return;
    }
    const allowed = getEffectiveOrigin();
    if (!allowed) {
      callback(null, true);
      return;
    }
    const allowedList = allowed.split(',').map((o) => o.trim()).filter(Boolean);
    const match = allowedList.length === 0 || allowedList.some((a) => reqOrigin === a);
    callback(null, match);
  };
}

export function initSocket(httpServer: import('http').Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: getCorsOrigin(),
    },
  });

  io.on('connection', (socket) => {
    socket.on('host:create', (payload: { quizFilename: string; username?: string; password?: string; playerJoinPassword?: string }, ack) => {
      const { quizFilename, username, password, playerJoinPassword } = payload ?? {};
      if (!quizFilename) {
        ack?.({ error: 'quizFilename required' });
        return;
      }
      if (!requireHostAuth()) {
        ack?.({ error: 'Hosting disabled' });
        return;
      }
      if (!checkHostCreateRateLimit(getClientAddressFromSocket(socket))) {
        ack?.({ error: 'Too many attempts' });
        return;
      }
      const hasValidCookie = isAuthenticated(socket.handshake.headers.cookie);
      const hasValidPassword =
        password && verifyWithEnvOrConfig((username ?? '').trim(), password);
      if (!hasValidCookie && !hasValidPassword) {
        logHostAuthFailure('host:create', socket, !!hasValidCookie, !!hasValidPassword);
        ack?.({ error: 'Invalid password' });
        return;
      }
      try {
        const roomId = createRoom(quizFilename, socket.id, playerJoinPassword);
        socket.join(roomId);
        socket.data.role = 'host';
        socket.data.roomId = roomId;
        const state = getRoom(roomId)!;
        ack?.({ roomId, state: serializeHostState(state) });
        void broadcastStateToRoom(io, roomId, state, ['state:update']);
      } catch (e) {
        ack?.({ error: String(e) });
      }
    });

    socket.on('player:join', (payload: { roomId: string; playerId?: string; password?: string }, ack) => {
      const { roomId, playerId, password } = payload ?? {};
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
      const resolvedPlayerId = playerId ?? crypto.randomUUID();
      const existingPlayer = state.players.get(resolvedPlayerId);
      if (existingPlayer?.socketId) {
        ack?.({ error: 'That player is already in the room' });
        return;
      }
      const roomJoinPassword = state.playerJoinPassword;
      if (roomJoinPassword) {
        // Allow seamless refresh/rejoin for already admitted players.
        const returningKnownPlayer = state.players.has(resolvedPlayerId);
        if (!returningKnownPlayer) {
          if (!password?.trim()) {
            ack?.({ error: 'Room password required' });
            return;
          }
          if (!verifyPasswordConstantTime(password, roomJoinPassword)) {
            ack?.({ error: 'Invalid room password' });
            return;
          }
        }
      }
      const players = new Map(state.players);
      const isReturning = !!existingPlayer;
      players.set(resolvedPlayerId, {
        id: resolvedPlayerId,
        name: isReturning ? existingPlayer!.name : '',
        emoji: isReturning ? existingPlayer!.emoji : '👤',
        score: isReturning ? existingPlayer!.score : 0,
        socketId: socket.id,
      });
      const nextState = { ...state, players };
      setRoom(roomId, nextState);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = 'player';
      socket.data.playerId = resolvedPlayerId;
      ack?.({ roomId, playerId: socket.data.playerId, state: serializePlayerState(nextState) });
      void broadcastStateToRoom(io, roomId, nextState, ['room:update']);
    });

    socket.on('player:register', (payload: { playerId: string; name: string; emoji: string }, ack) => {
      const { name, emoji } = payload ?? {};
      const roomId = socket.data.roomId;
      const playerId = socket.data.playerId;
      if (!roomId || !playerId) {
        ack?.({ error: 'Not in a room' });
        return;
      }
      const state = getRoom(roomId);
      if (!state || state.type !== 'Lobby') {
        ack?.({ error: 'Invalid state' });
        return;
      }
      const cappedName = (name || 'Anonymous').slice(0, 50);
      const profanityMode = getProfanityFilterMode();
      if (profanityMode !== 'off' && containsProfanityAggressive(cappedName)) {
        ack?.({ error: 'This name contains inappropriate content' });
        return;
      }
      if (getCustomKeywordFilterEnabled() && containsCustomBlockedTerm(cappedName)) {
        ack?.({ error: 'This name contains inappropriate content' });
        return;
      }
      const requestedEmoji = (emoji || '👤').slice(0, 4);
      const takenByActivePlayer = Array.from(state.players.entries()).some(
        ([id, p]) => id !== playerId && !!p.socketId && p.emoji === requestedEmoji
      );
      if (takenByActivePlayer) {
        ack?.({ error: 'Emoji unavailable' });
        return;
      }
      const players = new Map(state.players);
      players.set(playerId, {
        id: playerId,
        name: cappedName,
        emoji: requestedEmoji,
        score: 0,
        socketId: socket.id,
      });
      const next: GameState = { ...state, players };
      setRoom(roomId, next);
      ack?.({ ok: true });
      void broadcastStateToRoom(io, roomId, next, ['room:update']);
    });

    socket.on('player:leave', (_, ack) => {
      const roomId = socket.data.roomId;
      const playerId = socket.data.playerId;
      if (!roomId || !playerId || socket.data.role !== 'player') {
        ack?.({ error: 'Not in a room' });
        return;
      }
      const state = getRoom(roomId);
      if (!state) {
        ack?.({ ok: true });
        return;
      }
      const players = new Map(state.players);
      players.delete(playerId);
      const next = { ...state, players };
      setRoom(roomId, next);
      socket.leave(roomId);
      socket.data.roomId = undefined;
      socket.data.playerId = undefined;
      socket.data.role = undefined;
      ack?.({ ok: true });
      void broadcastStateToRoom(io, roomId, next, ['room:update']);
    });

    socket.on('projector:join', (payload: { roomId: string; password?: string }, ack) => {
      const { roomId, password } = payload ?? {};
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
      const roomJoinPassword = state.playerJoinPassword;
      if (roomJoinPassword) {
        if (!password?.trim()) {
          ack?.({ error: 'Room password required' });
          return;
        }
        if (!verifyPasswordConstantTime(password, roomJoinPassword)) {
          ack?.({ error: 'Invalid room password' });
          return;
        }
      }
      socket.join(roomId);
      socket.data.role = 'projector';
      socket.data.roomId = roomId;
      ack?.({ state: serializePlayerState(state) });
    });

    socket.on('host:join', (payload: { roomId: string; username?: string; password?: string }, ack) => {
      const { roomId, username, password } = payload ?? {};
      if (!roomId) {
        ack?.({ error: 'roomId required' });
        return;
      }
      if (!roomExists(roomId)) {
        ack?.({ error: 'Room not found' });
        return;
      }
      if (!requireHostAuth()) {
        ack?.({ error: 'Hosting disabled' });
        return;
      }
      if (!checkHostJoinRateLimit(getClientAddressFromSocket(socket))) {
        ack?.({ error: 'Too many attempts' });
        return;
      }
      const hasValidCookie = isAuthenticated(socket.handshake.headers.cookie);
      const hasValidPassword =
        password && verifyWithEnvOrConfig((username ?? '').trim(), password);
      if (!hasValidCookie && !hasValidPassword) {
        logHostAuthFailure('host:join', socket, !!hasValidCookie, !!hasValidPassword);
        ack?.({ error: 'Invalid password' });
        return;
      }
      socket.join(roomId);
      socket.data.role = 'host';
      socket.data.roomId = roomId;
      const state = getRoom(roomId)!;
      ack?.({ state: serializeHostState(state) });
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
      ack?.({ state: serializeHostState(state) });
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
      void broadcastStateToRoom(io, roomId, next, ['state:update']);
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
      void broadcastStateToRoom(io, roomId, next, ['state:update']);
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
      void broadcastStateToRoom(io, roomId, next, ['state:update']);
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
      void broadcastStateToRoom(io, roomId, next, ['state:update']);
    });

    socket.on('host:end_game', (_, ack) => {
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
      const next = transition(state, { type: 'END_GAME' });
      setRoom(roomId, next);
      if (next.type === 'End') {
        saveHistory(next);
      }
      ack?.({ ok: true });
      void broadcastStateToRoom(io, roomId, next, ['state:update']);
    });

    socket.on('host:override', (payload: { playerId: string; questionId: string; delta?: number }, ack) => {
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
      const { playerId, questionId, delta = 1 } = payload ?? {};
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
      const newScore = Math.max(0, player.score + delta);
      players.set(playerId, { ...player, score: newScore });
      const next = { ...state, players };
      setRoom(roomId, next);
      ack?.({ ok: true });
      void broadcastStateToRoom(io, roomId, next, ['state:update']);
    });

    socket.on(
      'player:answer',
      (
        payload: {
          questionId: string;
          answerIndex?: number;
          answerIndexes?: number[];
          answerNumber?: number;
          answerText?: string;
          answerX?: number;
          answerY?: number;
        },
        ack
      ) => {
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
      const { questionId, answerIndex, answerIndexes, answerNumber, answerText, answerX, answerY } = payload ?? {};
      if (!questionId) {
        ack?.({ error: 'questionId required' });
        return;
      }
      const question = state.quiz.rounds[state.currentRoundIndex]?.questions[state.currentQuestionIndex];
      if (!question || question.id !== questionId) {
        ack?.({ error: 'Invalid question' });
        return;
      }
      const existing = state.submissions.find((s) => s.playerId === playerId && s.questionId === questionId);
      if (existing) {
        ack?.({ error: 'Already submitted' });
        return;
      }
      if (state.timerEndsAt != null && Date.now() > state.timerEndsAt) {
        ack?.({ error: 'Time is up' });
        return;
      }
      let submission:
        | {
            playerId: string;
            questionId: string;
            answerIndex?: number;
            answerIndexes?: number[];
            answerNumber?: number;
            answerText?: string;
            answerX?: number;
            answerY?: number;
            submittedAt: number;
            visibility?: 'visible' | 'blocked';
          }
        | null = null;

      if (question.type === 'choice' || question.type === 'true_false' || question.type === 'poll') {
        if (
          answerIndex == null ||
          !Number.isInteger(answerIndex) ||
          answerIndex < 0 ||
          answerIndex >= (question.type === 'true_false' ? 2 : question.options.length)
        ) {
          ack?.({ error: 'Invalid answer' });
          return;
        }
        submission = {
          playerId,
          questionId,
          answerIndex,
          submittedAt: Date.now(),
        };
      } else if (question.type === 'multi_select') {
        const normalized =
          Array.isArray(answerIndexes)
            ? [...new Set(answerIndexes.filter((value) => Number.isInteger(value) && value >= 0 && value < question.options.length))].sort(
                (a, b) => a - b
              )
            : [];
        if (normalized.length === 0) {
          ack?.({ error: 'Select at least one option' });
          return;
        }
        submission = {
          playerId,
          questionId,
          answerIndexes: normalized,
          submittedAt: Date.now(),
        };
      } else if (question.type === 'reorder') {
        const normalized =
          Array.isArray(answerIndexes)
            ? answerIndexes.filter((value) => Number.isInteger(value) && value >= 0 && value < question.options.length)
            : [];
        if (normalized.length !== question.options.length || new Set(normalized).size !== question.options.length) {
          ack?.({ error: 'Invalid answer sequence' });
          return;
        }
        submission = {
          playerId,
          questionId,
          answerIndexes: normalized,
          submittedAt: Date.now(),
        };
      } else if (question.type === 'slider') {
        if (
          answerNumber == null ||
          !Number.isFinite(answerNumber) ||
          answerNumber < question.min ||
          answerNumber > question.max
        ) {
          ack?.({ error: 'Invalid answer' });
          return;
        }
        submission = {
          playerId,
          questionId,
          answerNumber,
          submittedAt: Date.now(),
        };
      } else if (question.type === 'hotspot') {
        if (
          answerX == null ||
          answerY == null ||
          !Number.isFinite(answerX) ||
          !Number.isFinite(answerY) ||
          answerX < 0 ||
          answerX > 1 ||
          answerY < 0 ||
          answerY > 1
        ) {
          ack?.({ error: 'Invalid answer' });
          return;
        }
        submission = {
          playerId,
          questionId,
          answerX,
          answerY,
          submittedAt: Date.now(),
        };
      } else {
        const normalized = answerText?.trim();
        if (!normalized) {
          ack?.({ error: 'Answer required' });
          return;
        }
        const maxLen =
          question.type === 'word_cloud' ? 75 : question.type === 'input' ? 75 : 200;
        const profanityMode = getProfanityFilterMode();
        const shouldFilter =
          (profanityMode === 'public_text' || profanityMode === 'strict') &&
          (question.type === 'open_ended' || question.type === 'word_cloud');
        const shouldFilterInput = profanityMode === 'strict' && question.type === 'input';
        const hasProfanity = (shouldFilter || shouldFilterInput) && containsProfanityAggressive(normalized);
        const hasCustomBlock = (shouldFilter || shouldFilterInput) && getCustomKeywordFilterEnabled() && containsCustomBlockedTerm(normalized);
        const isBlocked = hasProfanity || hasCustomBlock;
        submission = {
          playerId,
          questionId,
          answerText: normalized.slice(0, maxLen),
          submittedAt: Date.now(),
          visibility: isBlocked ? 'blocked' : 'visible',
        };
      }

      if (!submission) {
        ack?.({ error: 'Invalid answer' });
        return;
      }
      const submissions = [...state.submissions, submission];
      const next = { ...state, submissions };
      setRoom(roomId, next);
      ack?.({ ok: true });
      void broadcastStateToRoom(io, roomId, next, ['room:update', 'state:update']);
      }
    );

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
            void broadcastStateToRoom(io, roomId, getRoom(roomId)!, ['room:update']);
          }
        }
      }
    });
  });

  return io;
}

function serializeSubmissions(submissions: GameState['submissions'], forHost: boolean) {
  if (forHost) {
    return submissions.map((s) => {
      if (s.visibility === 'blocked') {
        const { answerText: _, ...rest } = s;
        return { ...rest, visibility: 'blocked' as const };
      }
      return s;
    });
  }
  return submissions.filter((s) => s.visibility !== 'blocked');
}

function serializeState(state: GameState, submissions: typeof state.submissions) {
  const {
    type,
    roomId,
    quiz,
    quizFilename,
    players,
    currentRoundIndex,
    currentQuestionIndex,
    wrongAnswers,
    timerEndsAt,
    startedAt,
  } = state;

  return {
    type,
    roomId,
    quiz,
    quizFilename,
    currentRoundIndex,
    currentQuestionIndex,
    submissions,
    wrongAnswers,
    timerEndsAt,
    startedAt,
    serverNow: Date.now(),
    players: Array.from(players.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      emoji: p.emoji,
      score: p.score,
      isActive: !!p.socketId,
    })),
  };
}

function serializeHostState(state: GameState) {
  return serializeState(state, serializeSubmissions(state.submissions, true));
}

function serializePlayerState(state: GameState) {
  const base = serializeState(state, serializeSubmissions(state.submissions, false));
  const { type, currentRoundIndex, currentQuestionIndex } = state;
  const isRevealPhase = type === 'RevealAnswer' || type === 'Scoreboard' || type === 'End';
  const quiz = {
    ...state.quiz,
    rounds: state.quiz.rounds.map((round, r) => ({
      ...round,
      questions: round.questions.map((q, i) => {
        const revealed =
          r < currentRoundIndex ||
          (r === currentRoundIndex && (isRevealPhase ? i <= currentQuestionIndex : i < currentQuestionIndex));
        if (revealed || !('answer' in q)) return q;
        const { answer, ...rest } = q as { answer?: unknown; [k: string]: unknown };
        return rest;
      }),
    })),
  };
  return { ...base, quiz };
}

async function broadcastStateToRoom(
  io: Server,
  roomId: string,
  state: GameState,
  events: ('state:update' | 'room:update')[] = ['state:update', 'room:update']
) {
  const sockets = await io.in(roomId).fetchSockets();
  const hostState = serializeHostState(state);
  const playerState = serializePlayerState(state);
  for (const s of sockets) {
    const st = s.data.role === 'host' ? hostState : playerState;
    for (const ev of events) {
      s.emit(ev, { state: st });
    }
  }
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
