import { writable, get } from 'svelte/store';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

function createSocketStore() {
  const store = writable<Socket | null>(null);
  const { subscribe, set } = store;

  return {
    subscribe,
    get: () => get(store),
    connect(): Socket {
      const existing = get(store);
      if (existing) {
        existing.disconnect();
      }
      const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
      set(socket);
      return socket;
    },
    set,
  };
}

export const socketStore = createSocketStore();
