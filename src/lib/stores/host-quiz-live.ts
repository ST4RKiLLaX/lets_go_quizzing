import { writable } from 'svelte/store';

export type HostQuizLive = { live: boolean; roomId?: string };
export const hostQuizLiveStore = writable<HostQuizLive>({ live: false });
