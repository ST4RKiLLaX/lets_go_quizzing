import type { SocketHandlerContext } from '../context.js';
import { registerDisconnectHandler } from './disconnect.js';
import { registerHostGameHandlers } from './host-game.js';
import { registerHostSessionHandlers } from './host-session.js';
import { registerPlayerHandlers } from './player.js';
import { registerProjectorHandlers } from './projector.js';
import { registerWaitingRoomHandlers } from './waiting-room.js';

export function registerSocketHandlers(ctx: SocketHandlerContext): void {
  registerHostSessionHandlers(ctx);
  registerHostGameHandlers(ctx);
  registerWaitingRoomHandlers(ctx);
  registerPlayerHandlers(ctx);
  registerProjectorHandlers(ctx);
  registerDisconnectHandler(ctx);
}
