import { writable, get } from 'svelte/store';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { SOCKET_OPTIONS } from '$lib/socket.js';

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
      const socket = io(SOCKET_OPTIONS);
      set(socket);
      return socket;
    },
    set,
  };
}

export const socketStore = createSocketStore();
