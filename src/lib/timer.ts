import { writable } from 'svelte/store';

export function useCountdown(timerEndsAt: number | undefined, clockOffsetMs = 0) {
  const remaining = writable(0);

  if (typeof window === 'undefined') {
    return { subscribe: remaining.subscribe, destroy: () => {} };
  }

  if (!timerEndsAt) {
    remaining.set(0);
    return { subscribe: remaining.subscribe, destroy: () => {} };
  }

  const update = () => {
    const correctedNow = Date.now() + clockOffsetMs;
    remaining.set(Math.max(0, Math.ceil((timerEndsAt - correctedNow) / 1000)));
  };
  update();
  const id = setInterval(update, 1000);

  return {
    subscribe: remaining.subscribe,
    destroy: () => clearInterval(id),
  };
}
