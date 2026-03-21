import type { SerializedPlayer } from '$lib/types/game.js';

/** Descending by score (host sidebar, leaderboards). */
export function sortPlayersByScore(
  players: SerializedPlayer[] | null | undefined
): SerializedPlayer[] {
  const list = players ?? [];
  return [...list].sort((a, b) => b.score - a.score);
}
