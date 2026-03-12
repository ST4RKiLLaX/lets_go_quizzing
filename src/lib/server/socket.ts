import { Server } from 'socket.io';
import { hasValidOperationalConfig, getEffectiveOrigin } from './config.js';
import { createSocketHandlerContext, registerSocketHandlers } from './socket/handlers.js';

function getCorsOrigin():
  | boolean
  | string
  | string[]
  | ((reqOrigin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  return (reqOrigin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!hasValidOperationalConfig()) {
      callback(null, true);
      return;
    }
    const allowed = getEffectiveOrigin();
    if (!allowed) {
      callback(null, true);
      return;
    }
    const allowedList = allowed
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const match = allowedList.length === 0 || (reqOrigin != null && allowedList.some((a) => reqOrigin === a));
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
    const ctx = createSocketHandlerContext(io, socket);
    registerSocketHandlers(ctx);
  });

  return io;
}
