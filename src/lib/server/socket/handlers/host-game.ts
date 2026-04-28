import type { PrizeTier } from '../../../types/prizes.js';
import type { SocketHandlerContext } from '../context.js';
import { loadConfig } from '../../config.js';
import { flushQueuedQuestionPatch } from '../question-patch.js';
import { createRoomPrizeConfig, isPrizeFeatureEnabled } from '../../prizes/service.js';
import { normalizeWordCloudToken } from '../../../utils/word-cloud.js';

export function registerHostGameHandlers(ctx: SocketHandlerContext): void {
  const { io, socket, getRoom, setRoom, transition, scoreSubmissions, broadcastStateToRoom, saveHistory } = ctx;

  socket.on('host:set_room_prize_config', (payload: { enabled?: boolean; tiers?: PrizeTier[] }, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId || socket.data.role !== 'host') {
      ack?.({ error: 'Unauthorized' });
      return;
    }
    if (!isPrizeFeatureEnabled(loadConfig())) {
      ack?.({ error: 'Prize feature disabled' });
      return;
    }
    const state = getRoom(roomId);
    if (!state) {
      ack?.({ error: 'Room not found' });
      return;
    }
    if (state.type !== 'Lobby') {
      ack?.({ error: 'Prize config can only be changed in the lobby' });
      return;
    }
    const roomPrizeConfig = createRoomPrizeConfig(payload, 'host');
    const next = { ...state, roomPrizeConfig };
    setRoom(roomId, next);
    ack?.({ ok: true, state: ctx.serializeHostState(next) });
    void broadcastStateToRoom(io, roomId, next);
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
      const idx = state.submissions.findIndex((s) => s.playerId === playerId && s.questionId === questionId);
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
