import type { Socket } from 'socket.io';
import { getClientAddressFromSocket } from '../address.js';

export function logHostAuthFailure(
  event: 'host:create' | 'host:join',
  socket: Socket,
  hasValidCookie: boolean,
  hasValidPassword: boolean
) {
  console.warn('[auth] host auth failed', {
    event,
    socketId: socket.id,
    clientAddress: getClientAddressFromSocket(socket),
    hasValidCookie,
    hasValidPassword,
  });
}
