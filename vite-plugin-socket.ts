import type { ViteDevServer } from 'vite';

export function socketPlugin() {
  return {
    name: 'socket-io',
    configureServer(server: ViteDevServer) {
      if (server.httpServer) {
        import('./src/lib/server/socket.js').then(({ initSocket }) => {
          initSocket(server.httpServer!);
        });
      }
    },
  };
}
