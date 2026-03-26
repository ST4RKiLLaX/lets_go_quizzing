import type { PrizeDefinition, PrizeOption } from '../types/prizes.js';

export function toPrizeOption(prize: Pick<PrizeDefinition, 'id' | 'name' | 'limit' | 'usage'>): PrizeOption {
  return {
    id: prize.id,
    name: prize.name,
    remainingQuantity: Math.max(0, prize.limit - prize.usage),
  };
}
