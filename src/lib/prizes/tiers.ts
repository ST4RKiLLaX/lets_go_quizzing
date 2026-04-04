import type { PrizeTier, RoomPrizeDefaultConfig } from '../types/prizes.js';

type PrizeTierInput = {
  awardBy?: 'score' | 'rank';
  minScore?: number;
  topCount?: number;
  prizeIds?: string[];
  prizeId?: string;
  label?: string;
};

function normalizePrizeIds(tier: PrizeTierInput): string[] {
  const rawPrizeIds = Array.isArray(tier.prizeIds)
    ? tier.prizeIds
    : typeof tier.prizeId === 'string'
      ? [tier.prizeId]
      : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const prizeId of rawPrizeIds) {
    const trimmed = prizeId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export function normalizePrizeTiers(tiers: PrizeTierInput[]): PrizeTier[] {
  return tiers
    .map((tier): PrizeTier => {
      const awardBy: PrizeTier['awardBy'] = tier.awardBy === 'rank' ? 'rank' : 'score';
      const base = {
        awardBy,
        prizeIds: normalizePrizeIds(tier),
        label: tier.label?.trim() || undefined,
      };

      if (awardBy === 'rank') {
        return {
          ...base,
          topCount: Math.max(1, Math.floor(Number(tier.topCount) || 1)),
        };
      }

      return {
        ...base,
        minScore: Math.max(0, Math.floor(Number(tier.minScore) || 0)),
      };
    })
    .filter((tier) => tier.prizeIds.length > 0)
    .sort((a, b) => {
      if (a.awardBy !== b.awardBy) {
        return a.awardBy === 'score' ? -1 : 1;
      }
      if (a.awardBy === 'score' && b.awardBy === 'score') {
        return (b.minScore ?? 0) - (a.minScore ?? 0);
      }
      return (a.topCount ?? 1) - (b.topCount ?? 1);
    });
}

export function buildDefaultRoomPrizeConfig(enabledByDefault: boolean, tiers: PrizeTier[]): RoomPrizeDefaultConfig {
  return {
    enabledByDefault,
    tiers: normalizePrizeTiers(tiers),
  };
}
