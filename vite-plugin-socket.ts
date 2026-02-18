import type { ViteDevServer } from 'vite';
import { initSocket } from './src/lib/server/socket.js';

export function socketPlugin() {
  return {
    name: 'socket-io',
    configureServer(server: ViteDevServer) {
      if (server.httpServer) {
        initSocket(server.httpServer);
      }
    },
  };
}
