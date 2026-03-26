import { z } from 'zod';

export const PrizeTierSchema = z.object({
  minScore: z.number().int().min(0),
  prizeId: z.string().trim().min(1),
  label: z.string().trim().max(120).optional(),
});

export const RoomPrizeConfigSchema = z.object({
  enabled: z.boolean(),
  tiers: z.array(PrizeTierSchema).max(50),
  configuredAt: z.number().int().nonnegative(),
  configuredBy: z.string().trim().min(1).max(120),
});

export const RoomPrizeDefaultConfigSchema = z.object({
  enabledByDefault: z.boolean(),
  tiers: z.array(PrizeTierSchema).max(50),
});

export const PrizeDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  url: z.string().url(),
  limit: z.number().int().min(1),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usage: z.number().int().min(0),
  active: z.boolean(),
  notes: z.string().trim().max(500).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const PrizeStoreSchema = z.object({
  version: z.number().int().min(1),
  prizes: z.array(PrizeDefinitionSchema),
});

export const PrizeRedemptionRecordSchema = z.object({
  redemptionId: z.string().trim().min(1),
  roomId: z.string().trim().min(1),
  quizFilename: z.string().trim().min(1),
  playerId: z.string().trim().min(1),
  playerName: z.string().trim().min(1),
  playerEmoji: z.string().trim().min(1),
  finalScore: z.number().int().min(0),
  prizeId: z.string().trim().min(1),
  prizeNameSnapshot: z.string().trim().min(1),
  prizeUrlSnapshot: z.string().url(),
  redeemedAt: z.number().int().nonnegative(),
  status: z.enum(['revealed', 'emailed', 'revoked']),
});

export const PrizeRedemptionStoreSchema = z.object({
  version: z.number().int().min(1),
  redemptions: z.array(PrizeRedemptionRecordSchema),
});
