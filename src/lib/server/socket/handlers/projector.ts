import type { SocketHandlerContext } from '../context.js';
import { verifyPasswordConstantTime } from '../../auth.js';
import { getClientAddressFromSocket } from '../../address.js';
import { checkPlayerJoinRateLimit } from '../../rate-limit.js';

export function registerProjectorHandlers(ctx: SocketHandlerContext): void {
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
