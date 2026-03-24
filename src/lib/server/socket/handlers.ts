import type { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { GameState, PendingPlayer } from '../game/state-machine.js';
import { createRoom, getRoom, setRoom, roomExists, removePendingPlayerBySocketId } from '../game/rooms.js';
import { transition } from '../game/state-machine.js';
import { scoreSubmissions } from '../game/scoring.js';
import { isAuthenticated, requireHostAuth, verifyWithEnvOrConfig, verifyPasswordConstantTime } from '../auth.js';
import { getProfanityFilterMode, getCustomKeywordFilterEnabled } from '../config.js';
import { containsProfanityAggressive } from '../profanity.js';
import { containsCustomBlockedTerm } from '../custom-block.js';
import { getClientAddressFromSocket } from '../address.js';
import {
  checkPlayerJoinRateLimit,
  checkHostCreateRateLimit,
  checkHostJoinRateLimit,
  checkHostGetStateRateLimit,
} from '../rate-limit.js';
import { serializeHostState, serializePlayerState, serializeProjectorState } from './serializers.js';
import { broadcastRoomPatchToRoom, broadcastStateToRoom } from './broadcast.js';
import { saveHistory } from './history.js';
import { normalizeWordCloudToken } from '../../utils/word-cloud.js';
import { flushQueuedQuestionPatch, queueQuestionPatch } from './question-patch.js';

function logHostAuthFailure(
  event: 'host:create' | 'host:join',
  socket: Socket,
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

export interface SocketHandlerContext {
  io: Server;
  socket: Socket;
  getRoom: typeof getRoom;
  setRoom: typeof setRoom;
  roomExists: typeof roomExists;
  createRoom: typeof createRoom;
  removePendingPlayerBySocketId: typeof removePendingPlayerBySocketId;
  transition: typeof transition;
  scoreSubmissions: typeof scoreSubmissions;
  serializeHostState: typeof serializeHostState;
  serializePlayerState: typeof serializePlayerState;
  serializeProjectorState: typeof serializeProjectorState;
  broadcastStateToRoom: typeof broadcastStateToRoom;
  broadcastRoomPatchToRoom: typeof broadcastRoomPatchToRoom;
  saveHistory: typeof saveHistory;
  logHostAuthFailure: typeof logHostAuthFailure;
}

function registerHostSessionHandlers(ctx: SocketHandlerContext): void {
  const { io, socket, createRoom, getRoom, roomExists, serializeHostState, broadcastStateToRoom, logHostAuthFailure } = ctx;

  socket.on(
    'host:create',
    (
      payload: {
        quizFilename: string;
        username?: string;
        password?: string;
        playerJoinPassword?: string;
        waitingRoomEnabled?: boolean;
        allowLateJoin?: boolean;
        autoAdmitBeforeGame?: boolean;
        manualAdmitAfterGame?: boolean;
      },
      ack
    ) => {
      const {
        quizFilename,
        username,
        password,
        playerJoinPassword,
        waitingRoomEnabled,
        allowLateJoin,
        autoAdmitBeforeGame,
        manualAdmitAfterGame,
      } = payload ?? {};
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
      const hasValidPassword = password && verifyWithEnvOrConfig((username ?? '').trim(), password);
      if (!hasValidCookie && !hasValidPassword) {
        logHostAuthFailure('host:create', socket, !!hasValidCookie, !!hasValidPassword);
        ack?.({ error: 'Invalid password' });
        return;
      }
      try {
        const roomId = createRoom(
          quizFilename,
          socket.id,
          playerJoinPassword,
          waitingRoomEnabled,
          allowLateJoin,
          autoAdmitBeforeGame,
          manualAdmitAfterGame
        );
        socket.join(roomId);
        socket.data.role = 'host';
        socket.data.roomId = roomId;
        const state = getRoom(roomId)!;
        ack?.({ roomId, state: serializeHostState(state) });
        void broadcastStateToRoom(io, roomId, state);
      } catch (e) {
        ack?.({ error: String(e) });
      }
    }
  );

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
    const hasValidPassword = password && verifyWithEnvOrConfig((username ?? '').trim(), password);
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
}

function registerHostGameHandlers(ctx: SocketHandlerContext): void {
  const { io, socket, getRoom, setRoom, transition, scoreSubmissions, broadcastStateToRoom, saveHistory } = ctx;

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
    void broadcastStateToRoom(io, roomId, next);
  });

  socket.on('host:start_question', (_, ack) => {
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
    if (state.type !== 'QuestionPreview') {
      ack?.({ error: 'Can only start question from preview' });
      return;
    }
    const next = transition(state, { type: 'START_QUESTION' });
    setRoom(roomId, next);
    ack?.({ ok: true });
    void broadcastStateToRoom(io, roomId, next);
  });

  socket.on('host:next', async (_, ack) => {
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
    if (state.type === 'Question') {
      await flushQueuedQuestionPatch(io, roomId, state);
      state = scoreSubmissions(state);
      setRoom(roomId, state);
    }
    const next = transition(state, { type: 'NEXT' });
    setRoom(roomId, next);
    if (next.type === 'End') {
      saveHistory(next);
    }
    ack?.({ ok: true });
    void broadcastStateToRoom(io, roomId, next);
  });

  socket.on('host:stop_timer', async (_, ack) => {
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
    await flushQueuedQuestionPatch(io, roomId, state);
    state = scoreSubmissions(state);
    setRoom(roomId, state);
    const next = transition(state, { type: 'STOP_TIMER' });
    setRoom(roomId, next);
    ack?.({ ok: true });
    void broadcastStateToRoom(io, roomId, next);
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
    void broadcastStateToRoom(io, roomId, next);
  });

  socket.on('host:end_game', async (_, ack) => {
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
    if (state.type === 'Question') {
      await flushQueuedQuestionPatch(io, roomId, state);
    }
    const next = transition(state, { type: 'END_GAME' });
    setRoom(roomId, next);
    if (next.type === 'End') {
      saveHistory(next);
    }
    ack?.({ ok: true });
    void broadcastStateToRoom(io, roomId, next);
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
    void broadcastStateToRoom(io, roomId, next);
  });

  socket.on(
    'host:set_submission_visibility',
    (payload: { playerId: string; questionId: string; visible: boolean }, ack) => {
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
      const { playerId, questionId, visible } = payload ?? {};
      if (!playerId || !questionId || typeof visible !== 'boolean') {
        ack?.({ error: 'playerId, questionId, and visible required' });
        return;
      }
      const idx = state.submissions.findIndex(
        (s) => s.playerId === playerId && s.questionId === questionId
      );
      if (idx < 0) {
        ack?.({ error: 'Submission not found' });
        return;
      }
      const submissions = [...state.submissions];
      submissions[idx] = { ...submissions[idx], projectorHiddenByHost: !visible };
      const next = { ...state, submissions };
      setRoom(roomId, next);
      ack?.({ ok: true });
      void broadcastStateToRoom(io, roomId, next);
    }
  );

  socket.on(
    'host:set_word_visibility',
    (payload: { questionId: string; word: string; visible: boolean }, ack) => {
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
      const { questionId, word, visible } = payload ?? {};
      if (!questionId || !word || typeof visible !== 'boolean') {
        ack?.({ error: 'questionId, word, and visible required' });
        return;
      }
      const normalized = normalizeWordCloudToken(word);
      if (!normalized) {
        ack?.({ ok: true });
        return;
      }
      const map = new Map(state.hiddenWordsByQuestion ?? new Map());
      const set = map.get(questionId) ?? new Set<string>();
      const nextSet = new Set(set);
      if (visible) {
        nextSet.delete(normalized);
      } else {
        nextSet.add(normalized);
      }
      if (nextSet.size === 0) {
        map.delete(questionId);
      } else {
        map.set(questionId, nextSet);
      }
      const next = { ...state, hiddenWordsByQuestion: map };
      setRoom(roomId, next);
      ack?.({ ok: true });
      void broadcastStateToRoom(io, roomId, next);
    }
  );
}

function registerWaitingRoomHandlers(ctx: SocketHandlerContext): void {
  const { io, socket, getRoom, setRoom, serializePlayerState, broadcastStateToRoom } = ctx;

  socket.on('host:kick', (payload: { playerId: string; ban?: boolean }, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId || socket.data.role !== 'host') {
      ack?.({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }
    const state = getRoom(roomId);
    if (!state) {
      ack?.({ ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }
    const { playerId, ban } = payload ?? {};
    if (!playerId) {
      ack?.({ ok: false, code: 'PLAYER_ID_REQUIRED', message: 'playerId required' });
      return;
    }
    const targetPlayer = state.players.get(playerId);
    if (!targetPlayer) {
      ack?.({ ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found' });
      return;
    }
    if (ban) {
      state.bannedPlayerIds.add(playerId);
    }
    const players = new Map(state.players);
    players.delete(playerId);
    const submissions = state.submissions.filter((s) => s.playerId !== playerId);
    const wrongAnswers = state.wrongAnswers.filter((w) => w.playerId !== playerId);
    const next = { ...state, players, submissions, wrongAnswers };
    setRoom(roomId, next);
    const targetSocketId = targetPlayer.socketId;
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('player:kicked', { banned: !!ban });
        targetSocket.disconnect(true);
      }
    }
    void broadcastStateToRoom(io, roomId, next);
    ack?.({ ok: true });
  });

  socket.on('host:approve', (payload: { playerId: string }, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId || socket.data.role !== 'host') {
      ack?.({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }
    const state = getRoom(roomId);
    if (!state) {
      ack?.({ ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }
    const { playerId } = payload ?? {};
    if (!playerId) {
      ack?.({ ok: false, code: 'PLAYER_ID_REQUIRED', message: 'playerId required' });
      return;
    }
    const pending = state.pendingPlayers?.get(playerId);
    if (!pending) {
      ack?.({ ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found in pending queue' });
      return;
    }
    const emojiTakenByPlayer = Array.from(state.players.entries()).some(
      ([id, p]) => id !== playerId && !!p.socketId && p.emoji === pending.emoji
    );
    const emojiTakenByOtherPending = Array.from(state.pendingPlayers?.entries() ?? []).some(
      ([id, p]) => id !== playerId && p.emoji === pending.emoji
    );
    if (emojiTakenByPlayer || emojiTakenByOtherPending) {
      ack?.({
        ok: false,
        code: 'EMOJI_UNAVAILABLE',
        message: 'That emoji was taken by another player. Ask them to pick a different one and try again.',
      });
      return;
    }
    const pendingPlayers = new Map(state.pendingPlayers);
    pendingPlayers.delete(playerId);
    const players = new Map(state.players);
    players.set(playerId, {
      id: playerId,
      name: pending.name,
      emoji: pending.emoji,
      score: 0,
      socketId: pending.socketId,
    });
    const nextState = { ...state, players, pendingPlayers };
    setRoom(roomId, nextState);
    const targetSocket = io.sockets.sockets.get(pending.socketId);
    if (targetSocket) {
      targetSocket.join(roomId);
      targetSocket.data.roomId = roomId;
      targetSocket.data.role = 'player';
      targetSocket.data.playerId = playerId;
      targetSocket.emit('player:admitted', { state: serializePlayerState(nextState) });
    }
    void broadcastStateToRoom(io, roomId, nextState);
    ack?.({ ok: true });
  });

  socket.on('host:deny', (payload: { playerId: string }, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId || socket.data.role !== 'host') {
      ack?.({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }
    const state = getRoom(roomId);
    if (!state) {
      ack?.({ ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }
    const { playerId } = payload ?? {};
    if (!playerId) {
      ack?.({ ok: false, code: 'PLAYER_ID_REQUIRED', message: 'playerId required' });
      return;
    }
    const pending = state.pendingPlayers?.get(playerId);
    if (!pending) {
      ack?.({ ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found in pending queue' });
      return;
    }
    const pendingPlayers = new Map(state.pendingPlayers);
    pendingPlayers.delete(playerId);
    const nextState = { ...state, pendingPlayers };
    setRoom(roomId, nextState);
    const usedEmojis = [
      ...Array.from(state.players.values())
        .filter((p) => !!p.socketId)
        .map((p) => p.emoji),
      ...Array.from(state.pendingPlayers?.values() ?? []).map((p) => p.emoji),
    ];
    const targetSocket = io.sockets.sockets.get(pending.socketId);
    if (targetSocket) {
      targetSocket.emit('player:denied', { usedEmojis });
    }
    void broadcastStateToRoom(io, roomId, nextState);
    ack?.({ ok: true });
  });

  socket.on('host:approve_all', (_, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId || socket.data.role !== 'host') {
      ack?.({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }
    const state = getRoom(roomId);
    if (!state) {
      ack?.({ ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }
    const pending = state.pendingPlayers;
    if (!pending || pending.size === 0) {
      ack?.({ ok: true });
      return;
    }
    const players = new Map(state.players);
    const pendingPlayers = new Map(pending);
    const usedEmojis = new Set(
      Array.from(players.values())
        .filter((p) => !!p.socketId)
        .map((p) => p.emoji)
    );
    const toAdmit: Array<{ playerId: string; socketId: string; name: string; emoji: string }> = [];
    for (const [playerId, p] of pending) {
      pendingPlayers.delete(playerId);
      if (usedEmojis.has(p.emoji)) {
        const targetSocket = io.sockets.sockets.get(p.socketId);
        if (targetSocket) {
          targetSocket.emit('player:denied', {
            message: 'Your emoji was taken by another player. Please try again with a different emoji.',
            usedEmojis: Array.from(usedEmojis),
          });
        }
        continue;
      }
      usedEmojis.add(p.emoji);
      players.set(playerId, {
        id: playerId,
        name: p.name,
        emoji: p.emoji,
        score: 0,
        socketId: p.socketId,
      });
      toAdmit.push({ playerId, socketId: p.socketId, name: p.name, emoji: p.emoji });
    }
    const nextState = { ...state, players, pendingPlayers };
    setRoom(roomId, nextState);
    const serialized = serializePlayerState(nextState);
    for (const { playerId, socketId } of toAdmit) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.join(roomId);
        targetSocket.data.roomId = roomId;
        targetSocket.data.role = 'player';
        targetSocket.data.playerId = playerId;
        targetSocket.emit('player:admitted', { state: serialized });
      }
    }
    void broadcastStateToRoom(io, roomId, nextState);
    ack?.({ ok: true });
  });
}

function registerPlayerHandlers(ctx: SocketHandlerContext): void {
  const { io, socket, getRoom, setRoom, roomExists, serializePlayerState, broadcastRoomPatchToRoom } = ctx;

  socket.on(
    'player:join',
    (payload: { roomId: string; playerId?: string; password?: string; name?: string; emoji?: string }, ack) => {
      const { roomId, playerId, password, name, emoji } = payload ?? {};
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
      if (state.bannedPlayerIds.has(resolvedPlayerId)) {
        ack?.({ ok: false, code: 'BANNED', message: 'You have been banned from this room' });
        return;
      }
      const existingPlayer = state.players.get(resolvedPlayerId);
      if (existingPlayer?.socketId) {
        ack?.({ error: 'That player is already in the room' });
        return;
      }
      const isReturning = !!existingPlayer;
      const roomJoinPassword = state.playerJoinPassword;
      if (roomJoinPassword && !isReturning) {
        if (!password?.trim()) {
          ack?.({ error: 'Room password required' });
          return;
        }
        if (!verifyPasswordConstantTime(password, roomJoinPassword)) {
          ack?.({ error: 'Invalid room password' });
          return;
        }
      }
      const gameStarted = state.type !== 'Lobby';
      if (state.waitingRoomEnabled && !isReturning) {
        if (gameStarted && !state.allowLateJoin) {
          ack?.({ ok: false, code: 'LATE_JOIN_DISABLED', message: 'This game has started. Late join is disabled.' });
          return;
        }
        const hasName = typeof name === 'string' && name.trim().length > 0;
        const hasEmoji = typeof emoji === 'string' && emoji.trim().length > 0;
        if (!hasName || !hasEmoji) {
          const usedEmojis = [
            ...Array.from(state.players.values())
              .filter((p) => !!p.socketId)
              .map((p) => p.emoji),
            ...Array.from(state.pendingPlayers?.values() ?? []).map((p) => p.emoji),
          ];
          ack?.({
            ok: false,
            code: 'REQUEST_REQUIRED',
            message: 'Enter your name and emoji to request access',
            usedEmojis,
          });
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
        const emojiTakenByPlayer = Array.from(state.players.entries()).some(
          ([, p]) => !!p.socketId && p.emoji === requestedEmoji
        );
        const emojiTakenByPending = Array.from(state.pendingPlayers?.values() ?? []).some(
          (p) => p.emoji === requestedEmoji
        );
        if (emojiTakenByPlayer || emojiTakenByPending) {
          const usedEmojis = [
            ...Array.from(state.players.values())
              .filter((p) => !!p.socketId)
              .map((p) => p.emoji),
            ...Array.from(state.pendingPlayers?.values() ?? []).map((p) => p.emoji),
          ];
          ack?.({ error: 'Emoji unavailable', usedEmojis });
          return;
        }
        if (state.pendingPlayers.has(resolvedPlayerId)) {
          ack?.({ ok: false, code: 'ALREADY_WAITING', message: 'You are already waiting for approval' });
          return;
        }
        const inLobby = state.type === 'Lobby';
        const autoAdmit = state.autoAdmitBeforeGame ?? true;
        if (inLobby && autoAdmit) {
          const players = new Map(state.players);
          players.set(resolvedPlayerId, {
            id: resolvedPlayerId,
            name: cappedName,
            emoji: requestedEmoji,
            score: 0,
            socketId: socket.id,
          });
          const nextState = { ...state, players };
          setRoom(roomId, nextState);
          socket.join(roomId);
          socket.data.roomId = roomId;
          socket.data.role = 'player';
          socket.data.playerId = resolvedPlayerId;
          ack?.({ roomId, playerId: resolvedPlayerId, state: serializePlayerState(nextState) });
          void broadcastRoomPatchToRoom(io, roomId, nextState);
          return;
        }
        const pending: PendingPlayer = {
          playerId: resolvedPlayerId,
          socketId: socket.id,
          name: cappedName,
          emoji: requestedEmoji,
          requestedAt: Date.now(),
        };
        const pendingPlayers = new Map(state.pendingPlayers);
        pendingPlayers.set(resolvedPlayerId, pending);
        const nextState = { ...state, pendingPlayers };
        setRoom(roomId, nextState);
        ack?.({ ok: true, status: 'pending' });
        void broadcastRoomPatchToRoom(io, roomId, nextState);
        return;
      }
      const players = new Map(state.players);
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
      void broadcastRoomPatchToRoom(io, roomId, nextState);
    }
  );

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
    void broadcastRoomPatchToRoom(io, roomId, next);
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
    void broadcastRoomPatchToRoom(io, roomId, next);
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
      /* eslint-disable-next-line no-useless-assignment -- submission built in branches, used after */
      let submission: {
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
      } | null = null;

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
        const normalized = Array.isArray(answerIndexes)
          ? [
              ...new Set(
                answerIndexes.filter(
                  (value) => Number.isInteger(value) && value >= 0 && value < question.options.length
                )
              ),
            ].sort((a, b) => a - b)
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
        const normalized = Array.isArray(answerIndexes)
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
      } else if (question.type === 'matching') {
        const normalized = Array.isArray(answerIndexes)
          ? answerIndexes.filter(
              (value) => Number.isInteger(value) && value >= 0 && value < question.options.length
            )
          : [];
        if (
          normalized.length !== question.items.length ||
          new Set(normalized).size !== question.items.length
        ) {
          ack?.({ error: 'Invalid matching answer' });
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
        const maxLen = question.type === 'word_cloud' ? 75 : question.type === 'input' ? 75 : 200;
        const profanityMode = getProfanityFilterMode();
        const shouldFilter =
          (profanityMode === 'public_text' || profanityMode === 'strict') &&
          (question.type === 'open_ended' || question.type === 'word_cloud');
        const shouldFilterInput = profanityMode === 'strict' && question.type === 'input';
        const hasProfanity = (shouldFilter || shouldFilterInput) && containsProfanityAggressive(normalized);
        const hasCustomBlock =
          (shouldFilter || shouldFilterInput) &&
          getCustomKeywordFilterEnabled() &&
          containsCustomBlockedTerm(normalized);
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
      queueQuestionPatch(io, roomId, getRoom);
    }
  );
}

function registerProjectorHandlers(ctx: SocketHandlerContext): void {
  const { socket, getRoom, roomExists, serializeProjectorState } = ctx;

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
    ack?.({ state: serializeProjectorState(state) });
  });
}

function registerDisconnectHandler(ctx: SocketHandlerContext): void {
  const { io, socket, getRoom, setRoom, removePendingPlayerBySocketId, broadcastRoomPatchToRoom } = ctx;

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
          void broadcastRoomPatchToRoom(io, roomId, getRoom(roomId)!);
        }
      }
    } else {
      const pendingRoomId = removePendingPlayerBySocketId(socket.id);
      if (pendingRoomId) {
        const state = getRoom(pendingRoomId);
        if (state) {
          void broadcastRoomPatchToRoom(io, pendingRoomId, state);
        }
      }
    }
  });
}

export function registerSocketHandlers(ctx: SocketHandlerContext): void {
  registerHostSessionHandlers(ctx);
  registerHostGameHandlers(ctx);
  registerWaitingRoomHandlers(ctx);
  registerPlayerHandlers(ctx);
  registerProjectorHandlers(ctx);
  registerDisconnectHandler(ctx);
}

export function createSocketHandlerContext(io: Server, socket: Socket): SocketHandlerContext {
  return {
    io,
    socket,
    getRoom,
    setRoom,
    roomExists,
    createRoom,
    removePendingPlayerBySocketId,
    transition,
    scoreSubmissions,
    serializeHostState,
    serializePlayerState,
    serializeProjectorState,
    broadcastStateToRoom,
    broadcastRoomPatchToRoom,
    saveHistory,
    logHostAuthFailure,
  };
}
