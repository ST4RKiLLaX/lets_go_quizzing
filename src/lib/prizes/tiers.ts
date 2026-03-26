import type { PrizeTier, RoomPrizeDefaultConfig } from '../types/prizes.js';

export function normalizePrizeTiers(tiers: PrizeTier[]): PrizeTier[] {
  return tiers
    .map((tier) => ({
      minScore: Math.max(0, Math.floor(Number(tier.minScore) || 0)),
      prizeId: tier.prizeId.trim(),
      label: tier.label?.trim() || undefined,
    }))
    .filter((tier) => tier.prizeId.length > 0)
    .sort((a, b) => b.minScore - a.minScore);
}

export function buildDefaultRoomPrizeConfig(enabledByDefault: boolean, tiers: PrizeTier[]): RoomPrizeDefaultConfig {
  return {
    enabledByDefault,
    tiers: normalizePrizeTiers(tiers),
  };
}
