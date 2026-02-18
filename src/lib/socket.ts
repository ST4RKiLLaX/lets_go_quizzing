import { io } from 'socket.io-client';

const PLAYER_ID_KEY = 'lgq_player_id';

export function getOrCreatePlayerId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function createSocket() {
  return io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
}
