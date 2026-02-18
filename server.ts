import http from 'node:http';
import polka from 'polka';
import { handler } from './build/handler.js';
import { initSocket } from './src/lib/server/socket.js';

const httpServer = http.createServer();
initSocket(httpServer);

const app = polka({ server: httpServer }).use(handler);

const port = parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';

app.listen({ port, host }, () => {
  console.log(`Lets Go Quizzing running at http://${host}:${port}`);
});
