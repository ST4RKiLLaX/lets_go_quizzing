import { writable } from 'svelte/store';

export type HostSession = {
  active: boolean;
  roomId?: string;
};

export const hostSessionStore = writable<HostSession>({
  active: false
});
