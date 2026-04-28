import type { SocketHandlerContext } from '../context.js';

export function registerDisconnectHandler(ctx: SocketHandlerContext): void {
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
