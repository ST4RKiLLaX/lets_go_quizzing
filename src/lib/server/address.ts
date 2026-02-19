import type { Socket } from 'socket.io';

export function getClientAddressFromSocket(socket: Socket): string {
  const header = process.env.ADDRESS_HEADER?.toLowerCase().trim();
  if (!header) return socket.handshake.address;

  const raw = socket.handshake.headers[header];
  if (typeof raw !== 'string') return socket.handshake.address;

  const first = raw.split(',')[0]?.trim();
  return first || socket.handshake.address;
}
