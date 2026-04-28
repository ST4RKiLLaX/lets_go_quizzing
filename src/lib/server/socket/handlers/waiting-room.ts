import type { SocketHandlerContext } from '../context.js';

export function registerWaitingRoomHandlers(ctx: SocketHandlerContext): void {
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
      totalAnswerTimeMs: 0,
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
      targetSocket.emit('player:admitted', { state: serializePlayerState(nextState, playerId) });
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
        totalAnswerTimeMs: 0,
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
