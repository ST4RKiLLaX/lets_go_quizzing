import type { GameState, PendingPlayer } from '../../game/state-machine.js';
import type { SocketHandlerContext } from '../context.js';
import { verifyPasswordConstantTime } from '../../auth.js';
import { getProfanityFilterMode, getCustomKeywordFilterEnabled } from '../../config.js';
import { containsProfanityAggressive } from '../../profanity.js';
import { containsCustomBlockedTerm } from '../../custom-block.js';
import { getClientAddressFromSocket } from '../../address.js';
import { checkPlayerJoinRateLimit } from '../../rate-limit.js';
import { normalizePlayerEmoji } from '../../../player/emoji-options.js';
import { queueQuestionPatch } from '../question-patch.js';

export function registerPlayerHandlers(ctx: SocketHandlerContext): void {
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
        const requestedEmoji = normalizePlayerEmoji(emoji);
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
            totalAnswerTimeMs: 0,
            socketId: socket.id,
          });
          const nextState = { ...state, players };
          setRoom(roomId, nextState);
          socket.join(roomId);
          socket.data.roomId = roomId;
          socket.data.role = 'player';
          socket.data.playerId = resolvedPlayerId;
          ack?.({ roomId, playerId: resolvedPlayerId, state: serializePlayerState(nextState, resolvedPlayerId) });
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
        totalAnswerTimeMs: isReturning ? existingPlayer!.totalAnswerTimeMs ?? 0 : 0,
        socketId: socket.id,
      });
      const nextState = { ...state, players };
      setRoom(roomId, nextState);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = 'player';
      socket.data.playerId = resolvedPlayerId;
      ack?.({ roomId, playerId: socket.data.playerId, state: serializePlayerState(nextState, socket.data.playerId) });
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
    const requestedEmoji = normalizePlayerEmoji(emoji);
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
      totalAnswerTimeMs: 0,
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
      } else if (question.type === 'click_to_match' || question.type === 'drag_and_drop') {
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
      const players = new Map(state.players);
      const player = players.get(playerId);
      if (!player) {
        ack?.({ error: 'Player not found' });
        return;
      }
      const answerDurationMs = Math.max(0, submission.submittedAt - (state.questionStartedAt ?? submission.submittedAt));
      players.set(playerId, {
        ...player,
        totalAnswerTimeMs: (player.totalAnswerTimeMs ?? 0) + answerDurationMs,
      });
      const next = { ...state, submissions, players };
      setRoom(roomId, next);
      ack?.({ ok: true });
      queueQuestionPatch(io, roomId, getRoom);
    }
  );
}
