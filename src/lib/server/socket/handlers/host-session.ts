import type { PrizeTier } from '../../../types/prizes.js';
import type { SocketHandlerContext } from '../context.js';
import { isAuthenticated, requireHostAuth, verifyWithEnvOrConfig } from '../../auth.js';
import { loadConfig } from '../../config.js';
import { getClientAddressFromSocket } from '../../address.js';
import { checkHostCreateRateLimit, checkHostGetStateRateLimit, checkHostJoinRateLimit } from '../../rate-limit.js';
import { createRoomPrizeConfig, isPrizeFeatureEnabled } from '../../prizes/service.js';

export function registerHostSessionHandlers(ctx: SocketHandlerContext): void {
  const { io, socket, createRoom, getRoom, roomExists, serializeHostState, broadcastStateToRoom, logHostAuthFailure } =
    ctx;

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
        roomPrizeConfig?: { enabled?: boolean; tiers?: PrizeTier[] };
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
        roomPrizeConfig,
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
        const config = loadConfig();
        const prizeConfig =
          isPrizeFeatureEnabled(config) && roomPrizeConfig
            ? createRoomPrizeConfig(roomPrizeConfig, (username ?? '').trim() || 'host')
            : undefined;
        const roomId = createRoom(
          quizFilename,
          socket.id,
          playerJoinPassword,
          waitingRoomEnabled,
          allowLateJoin,
          autoAdmitBeforeGame,
          manualAdmitAfterGame,
          prizeConfig
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
