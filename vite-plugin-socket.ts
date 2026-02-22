import type { ViteDevServer } from 'vite';
import type { Server as HttpServer } from 'http';

export function socketPlugin() {
  return {
    name: 'socket-io',
    configureServer(server: ViteDevServer) {
      if (server.httpServer) {
        const httpServer = server.httpServer as HttpServer;
        import('./src/lib/server/socket.js').then(({ initSocket }) => {
          initSocket(httpServer);
        });
      }
    },
  };
}
