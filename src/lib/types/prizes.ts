export type PrizeTierAwardBy = 'score' | 'rank';

export interface PrizeTier {
  awardBy: PrizeTierAwardBy;
  minScore?: number;
  topCount?: number;
  prizeIds: string[];
  label?: string;
}

export interface RoomPrizeConfig {
  enabled: boolean;
  tiers: PrizeTier[];
  configuredAt: number;
  configuredBy: string;
}

export interface RoomPrizeDefaultConfig {
  enabledByDefault: boolean;
  tiers: PrizeTier[];
}

export interface PrizeOption {
  id: string;
  name: string;
  remainingQuantity?: number;
}

export interface PrizeDefinition extends PrizeOption {
  url: string;
  limit: number;
  expirationDate: string;
  usage: number;
  active: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PrizeRedemptionRecord {
  claimId?: string;
  redemptionId: string;
  roomId: string;
  quizFilename: string;
  playerId: string;
  playerName: string;
  playerEmoji: string;
  finalScore: number;
  prizeId: string;
  prizeNameSnapshot: string;
  prizeUrlSnapshot: string;
  redeemedAt: number;
  status: 'revealed' | 'emailed' | 'revoked';
}

export interface ClaimedPrize {
  redemptionId: string;
  prizeId: string;
  prizeName: string;
  prizeUrl: string;
  status: PrizeRedemptionRecord['status'];
}

export interface PrizeClaimResult {
  claimId: string;
  roomId: string;
  playerId: string;
  playerName: string;
  playerEmoji: string;
  finalScore: number;
  bestTier: PrizeTier;
  matchedTiers: PrizeTier[];
  prizes: ClaimedPrize[];
}

export interface PrizeEligibility {
  eligible: boolean;
  bestTier?: PrizeTier;
  matchedTiers?: PrizeTier[];
  prizes?: PrizeOption[];
  claim?: PrizeClaimResult;
  reason?: 'disabled' | 'room_not_found' | 'not_ready' | 'not_eligible' | 'prize_missing' | 'already_claimed';
}
