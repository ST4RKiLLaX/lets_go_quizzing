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
    // Prefer websocket; fall back to long-polling for restrictive networks.
    transports: ['websocket', 'polling'],
    // Compress payloads only above ~1KB. Full state:update on Question phase
    // (with the quiz projection at join / reveal boundaries) benefits; small
    // patches (room:patch, question:patch) skip compression to save CPU.
    perMessageDeflate: {
      threshold: 1024,
    },
    // Cap inbound payload at 1MB — well above any legitimate quiz answer and
    // any authored quiz file. Blocks accidental / malicious oversized frames.
    maxHttpBufferSize: 1_000_000,
    // Slightly tighter than defaults (25s / 20s) so dead sockets are detected
    // faster and player list "isActive" reflects reality within ~30s.
    pingInterval: 20_000,
    pingTimeout: 15_000,
  });

  io.on('connection', (socket) => {
    const ctx = createSocketHandlerContext(io, socket);
    registerSocketHandlers(ctx);
  });

  return io;
}
