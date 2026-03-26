export interface PrizeTier {
  minScore: number;
  prizeId: string;
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

export interface PrizeEligibility {
  eligible: boolean;
  bestTier?: PrizeTier;
  prize?: PrizeOption;
  reason?: 'disabled' | 'room_not_found' | 'not_ready' | 'not_eligible' | 'prize_missing' | 'already_claimed';
}
