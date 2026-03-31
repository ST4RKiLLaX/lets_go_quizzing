import type { PrizeOption, PrizeTier } from '../types/prizes.js';

export function isPrizeOptionClaimable(prize: Pick<PrizeOption, 'remainingQuantity'>): boolean {
  return prize.remainingQuantity !== 0;
}

export function getClaimablePrizeOptions(prizes: PrizeOption[]): PrizeOption[] {
  return prizes.filter(isPrizeOptionClaimable);
}

export function findUnavailablePrizeId(tiers: PrizeTier[], prizeOptions: PrizeOption[]): string | undefined {
  const prizeOptionsById = new Map(prizeOptions.map((prize) => [prize.id, prize]));
  for (const tier of tiers) {
    for (const prizeId of tier.prizeIds) {
      const prize = prizeOptionsById.get(prizeId);
      if (!prize || !isPrizeOptionClaimable(prize)) {
        return prizeId;
      }
    }
  }
  return undefined;
}
