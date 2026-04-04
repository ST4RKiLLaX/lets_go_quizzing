import type { SerializedPlayer } from '$lib/types/game.js';

type RankablePlayer = {
  id: string;
  score: number;
  totalAnswerTimeMs?: number;
};

export type RankedPlayer<T extends RankablePlayer> = T & {
  totalAnswerTimeMs: number;
  rank: number;
};

function getComparableAnswerTime(player: Pick<RankablePlayer, 'totalAnswerTimeMs'>): number {
  return Math.max(0, Math.floor(player.totalAnswerTimeMs ?? 0));
}

export function comparePlayersForPlacement(
  a: Pick<RankablePlayer, 'id' | 'score' | 'totalAnswerTimeMs'>,
  b: Pick<RankablePlayer, 'id' | 'score' | 'totalAnswerTimeMs'>
): number {
  const scoreDiff = b.score - a.score;
  if (scoreDiff !== 0) return scoreDiff;

  const timeDiff = getComparableAnswerTime(a) - getComparableAnswerTime(b);
  if (timeDiff !== 0) return timeDiff;

  return a.id.localeCompare(b.id);
}

export function buildRankedPlayers<T extends RankablePlayer>(players: Iterable<T>): RankedPlayer<T>[] {
  const sorted: RankedPlayer<T>[] = Array.from(players)
    .map((player) => ({
      ...player,
      totalAnswerTimeMs: getComparableAnswerTime(player),
      rank: 0,
    }))
    .sort(comparePlayersForPlacement);

  let nextRank = 1;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = sorted[index - 1];
    if (index > 0 && previous && previous.score === current.score && previous.totalAnswerTimeMs === current.totalAnswerTimeMs) {
      sorted[index] = { ...current, rank: sorted[index - 1].rank };
      continue;
    }
    sorted[index] = { ...current, rank: nextRank };
    nextRank = index + 2;
  }

  return sorted;
}

/** Descending by score (host sidebar, leaderboards). */
export function sortPlayersByScore(
  players: SerializedPlayer[] | null | undefined
): SerializedPlayer[] {
  const list = players ?? [];
  return [...list].sort((a, b) => b.score - a.score);
}
