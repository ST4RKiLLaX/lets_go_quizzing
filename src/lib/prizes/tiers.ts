import type { PrizeTier, RoomPrizeDefaultConfig } from '../types/prizes.js';

type PrizeTierInput = {
  minScore: number;
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
    .map((tier) => ({
      minScore: Math.max(0, Math.floor(Number(tier.minScore) || 0)),
      prizeIds: normalizePrizeIds(tier),
      label: tier.label?.trim() || undefined,
    }))
    .filter((tier) => tier.prizeIds.length > 0)
    .sort((a, b) => b.minScore - a.minScore);
}

export function buildDefaultRoomPrizeConfig(enabledByDefault: boolean, tiers: PrizeTier[]): RoomPrizeDefaultConfig {
  return {
    enabledByDefault,
    tiers: normalizePrizeTiers(tiers),
  };
}
