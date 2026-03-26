import { createHash, createHmac, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { loadConfig, type AppConfig } from '../config.js';
import type { GameState } from '../game/state-machine.js';
import { getPrizeEmailSmtpPassword } from '../secrets.js';
import type {
  PrizeDefinition,
  PrizeEligibility,
  PrizeOption,
  PrizeRedemptionRecord,
  PrizeTier,
  RoomPrizeConfig,
  RoomPrizeDefaultConfig,
} from '../../types/prizes.js';
import { RoomPrizeConfigSchema, RoomPrizeDefaultConfigSchema } from './schema.js';
import { loadPrizeRedemptionStore, loadPrizeStore, savePrizeRedemptionStore, savePrizeStore, withPrizeMutationLock } from './store.js';

function normalizeRoomPrizeTiers(tiers: PrizeTier[]): PrizeTier[] {
  return tiers
    .map((tier) => ({
      minScore: Math.max(0, Math.floor(Number(tier.minScore) || 0)),
      prizeId: tier.prizeId.trim(),
      label: tier.label?.trim() || undefined,
    }))
    .filter((tier) => tier.prizeId.length > 0)
    .sort((a, b) => b.minScore - a.minScore);
}

function normalizePrizeField(value: string): string {
  return value.trim();
}

function isValidExpirationDate(expirationDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) return false;
  const parsed = new Date(`${expirationDate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

function getPrizeExpirationTimestamp(expirationDate: string): number {
  return new Date(`${expirationDate}T23:59:59.999Z`).getTime();
}

export function isPrizeExpired(prize: Pick<PrizeDefinition, 'expirationDate'>, now = Date.now()): boolean {
  return getPrizeExpirationTimestamp(prize.expirationDate) < now;
}

export function generatePrizeId(input: {
  name: string;
  url: string;
  limit: number;
  expirationDate: string;
  createdAt: number;
}): string {
  const fingerprint = [
    normalizePrizeField(input.name).toLowerCase(),
    normalizePrizeField(input.url),
    String(Math.max(1, Math.floor(input.limit))),
    input.expirationDate.trim(),
    String(Math.floor(input.createdAt)),
  ].join('|');
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
}

function getPrizeTokenSecret(config: AppConfig | null | undefined): string | undefined {
  return config?.adminPasswordHash || process.env.HOST_PASSWORD?.trim() || undefined;
}

interface PrizeEmailTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
}

function buildPrizeEmailFrom(config: PrizeEmailTransportConfig): string {
  const fromName = config.fromName?.trim();
  if (!fromName) return config.fromEmail;
  return `${fromName} <${config.fromEmail}>`;
}

function getPrizeEmailTransportConfig(config: AppConfig | null | undefined): PrizeEmailTransportConfig | undefined {
  const host = config?.prizeEmailSmtpHost?.trim();
  const port = config?.prizeEmailSmtpPort;
  const secure = config?.prizeEmailSmtpSecure === true;
  const username = config?.prizeEmailSmtpUsername?.trim();
  const password = getPrizeEmailSmtpPassword();
  const fromEmail = config?.prizeEmailFromEmail?.trim();
  const fromName = config?.prizeEmailFromName?.trim() || undefined;
  if (!host || !port || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !password || !fromEmail) {
    return undefined;
  }
  return {
    host,
    port,
    secure,
    username,
    password,
    fromEmail,
    fromName,
  };
}

export function isPrizeFeatureEnabled(config: AppConfig | null | undefined): boolean {
  return config?.prizesEnabled === true;
}

export function isPrizeEmailEnabled(config: AppConfig | null | undefined): boolean {
  return isPrizeFeatureEnabled(config) && config?.prizeEmailEnabled === true && isPrizeEmailTransportConfigured(config);
}

export function isPrizeEmailTransportConfigured(config: AppConfig | null | undefined): boolean {
  return !!getPrizeEmailTransportConfig(config);
}

export async function testPrizeEmailTransport(config: AppConfig | null | undefined): Promise<void> {
  const transportConfig = getPrizeEmailTransportConfig(config);
  if (!transportConfig) {
    throw new Error('Prize email transport is not configured');
  }
  const transporter = nodemailer.createTransport({
    host: transportConfig.host,
    port: transportConfig.port,
    secure: transportConfig.secure,
    auth: {
      user: transportConfig.username,
      pass: transportConfig.password,
    },
  });
  await transporter.verify();
}

export function validateRoomPrizeDefaultConfig(raw: unknown): RoomPrizeDefaultConfig | undefined {
  if (!raw) return undefined;
  const parsed = RoomPrizeDefaultConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Invalid default room prize config');
  }
  return {
    enabledByDefault: parsed.data.enabledByDefault,
    tiers: normalizeRoomPrizeTiers(parsed.data.tiers),
  };
}

export function createPrizeClaimToken(params: {
  roomId: string;
  playerId: string;
  finalScore: number;
  quizFilename: string;
  startedAt?: number;
  config: AppConfig | null | undefined;
}): string | undefined {
  const secret = getPrizeTokenSecret(params.config);
  if (!secret) return undefined;
  const payload = JSON.stringify({
    roomId: params.roomId,
    playerId: params.playerId,
    finalScore: params.finalScore,
    quizFilename: params.quizFilename,
    startedAt: params.startedAt ?? 0,
  });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyPrizeClaimToken(params: {
  token: string;
  roomId: string;
  playerId: string;
  finalScore: number;
  quizFilename: string;
  startedAt?: number;
  config: AppConfig | null | undefined;
}): boolean {
  const secret = getPrizeTokenSecret(params.config);
  if (!secret) return false;
  const [encoded, signature] = params.token.split('.');
  if (!encoded || !signature) return false;
  const expectedSignature = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (expectedSignature !== signature) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    return (
      payload.roomId === params.roomId &&
      payload.playerId === params.playerId &&
      payload.finalScore === params.finalScore &&
      payload.quizFilename === params.quizFilename &&
      payload.startedAt === (params.startedAt ?? 0)
    );
  } catch {
    return false;
  }
}

export function createRoomPrizeConfig(
  raw: { enabled?: boolean; tiers?: PrizeTier[] } | undefined,
  configuredBy: string
): RoomPrizeConfig | undefined {
  if (!raw?.enabled) return undefined;
  const tiers = normalizeRoomPrizeTiers(raw.tiers ?? []);
  if (tiers.length === 0) return undefined;
  return RoomPrizeConfigSchema.parse({
    enabled: true,
    tiers,
    configuredAt: Date.now(),
    configuredBy,
  });
}

export function listPrizeOptions(): PrizeOption[] {
  return loadPrizeStore()
    .prizes.filter((prize) => prize.active && !isPrizeExpired(prize))
    .map((prize) => ({ id: prize.id, name: prize.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listPrizes(): PrizeDefinition[] {
  return loadPrizeStore().prizes.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createPrize(input: {
  name: string;
  url: string;
  limit: number;
  expirationDate: string;
  notes?: string;
}): Promise<PrizeDefinition> {
  return withPrizeMutationLock(() => {
    const store = loadPrizeStore();
    const expirationDate = input.expirationDate.trim();
    if (!isValidExpirationDate(expirationDate)) {
      throw new Error('Expiration date is required');
    }
    const now = Date.now();
    const prizeId = generatePrizeId({
      name: input.name,
      url: input.url,
      limit: input.limit,
      expirationDate,
      createdAt: now,
    });
    if (store.prizes.some((prize) => prize.id === prizeId)) {
      throw new Error('Prize ID already exists');
    }
    const next: PrizeDefinition = {
      id: prizeId,
      name: normalizePrizeField(input.name),
      url: normalizePrizeField(input.url),
      limit: Math.max(1, Math.floor(input.limit)),
      expirationDate,
      usage: 0,
      active: true,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    savePrizeStore([...store.prizes, next]);
    return next;
  });
}

export async function updatePrize(
  prizeId: string,
  updates: Partial<Pick<PrizeDefinition, 'name' | 'url' | 'limit' | 'expirationDate' | 'active' | 'notes'>>
): Promise<PrizeDefinition> {
  return withPrizeMutationLock(() => {
    const store = loadPrizeStore();
    const idx = store.prizes.findIndex((prize) => prize.id === prizeId);
    if (idx < 0) {
      throw new Error('Prize not found');
    }
    const current = store.prizes[idx];
    const expirationDate =
      updates.expirationDate !== undefined ? updates.expirationDate.trim() : current.expirationDate;
    if (!isValidExpirationDate(expirationDate)) {
      throw new Error('Expiration date is required');
    }
    const next: PrizeDefinition = {
      ...current,
      name: updates.name !== undefined ? normalizePrizeField(updates.name) : current.name,
      url: updates.url !== undefined ? normalizePrizeField(updates.url) : current.url,
      limit: updates.limit !== undefined ? Math.max(1, Math.floor(updates.limit)) : current.limit,
      expirationDate,
      active: updates.active !== undefined ? updates.active : current.active,
      notes: updates.notes !== undefined ? updates.notes.trim() || undefined : current.notes,
      updatedAt: Date.now(),
    };
    if (next.limit < next.usage) {
      throw new Error('Limit cannot be lower than current usage');
    }
    const prizes = [...store.prizes];
    prizes[idx] = next;
    savePrizeStore(prizes);
    return next;
  });
}

export async function deletePrize(prizeId: string): Promise<void> {
  return withPrizeMutationLock(() => {
    const store = loadPrizeStore();
    const prize = store.prizes.find((entry) => entry.id === prizeId);
    if (!prize) {
      throw new Error('Prize not found');
    }
    if (prize.usage > 0) {
      throw new Error('Used prizes cannot be deleted');
    }
    savePrizeStore(store.prizes.filter((entry) => entry.id !== prizeId));
  });
}

function getBestEligibleTier(config: RoomPrizeConfig | undefined, score: number): PrizeTier | undefined {
  if (!config?.enabled) return undefined;
  return normalizeRoomPrizeTiers(config.tiers).find((tier) => score >= tier.minScore);
}

export function getPrizeEligibility(state: GameState | undefined, playerId: string, config: AppConfig | null): PrizeEligibility {
  if (!isPrizeFeatureEnabled(config)) {
    return { eligible: false, reason: 'disabled' };
  }
  if (!state) {
    return { eligible: false, reason: 'room_not_found' };
  }
  if (state.type !== 'End') {
    return { eligible: false, reason: 'not_ready' };
  }
  const player = state.players.get(playerId);
  if (!player) {
    return { eligible: false, reason: 'not_eligible' };
  }
  const tier = getBestEligibleTier(state.roomPrizeConfig, player.score);
  if (!tier) {
    return { eligible: false, reason: 'not_eligible' };
  }
  const prize = loadPrizeStore().prizes.find(
    (entry) => entry.id === tier.prizeId && entry.active && !isPrizeExpired(entry)
  );
  if (!prize) {
    return { eligible: false, reason: 'prize_missing' };
  }
  const existing = loadPrizeRedemptionStore().redemptions.find(
    (redemption) => redemption.roomId === state.roomId && redemption.playerId === playerId
  );
  if (existing) {
    return {
      eligible: false,
      reason: 'already_claimed',
      bestTier: tier,
      prize: { id: prize.id, name: prize.name },
    };
  }
  return {
    eligible: true,
    bestTier: tier,
    prize: { id: prize.id, name: prize.name },
  };
}

export async function claimPrizeForPlayer(state: GameState, playerId: string, config: AppConfig | null): Promise<PrizeRedemptionRecord> {
  if (!isPrizeFeatureEnabled(config)) {
    throw new Error('Prize feature disabled');
  }
  if (state.type !== 'End') {
    throw new Error('Prize claim is not available yet');
  }
  const player = state.players.get(playerId);
  if (!player) {
    throw new Error('Player not found');
  }
  const tier = getBestEligibleTier(state.roomPrizeConfig, player.score);
  if (!tier) {
    throw new Error('Player is not eligible for a prize');
  }

  return withPrizeMutationLock(() => {
    const redemptionStore = loadPrizeRedemptionStore();
    if (
      redemptionStore.redemptions.some(
        (redemption) => redemption.roomId === state.roomId && redemption.playerId === playerId
      )
    ) {
      throw new Error('Prize already claimed');
    }

    const prizeStore = loadPrizeStore();
    const prizeIdx = prizeStore.prizes.findIndex((entry) => entry.id === tier.prizeId);
    if (prizeIdx < 0) {
      throw new Error('Assigned prize not found');
    }
    const prize = prizeStore.prizes[prizeIdx];
    if (!prize.active) {
      throw new Error('Assigned prize is inactive');
    }
    if (isPrizeExpired(prize)) {
      throw new Error('Assigned prize has expired');
    }
    if (prize.usage >= prize.limit) {
      throw new Error('Assigned prize is no longer available');
    }

    const updatedPrize: PrizeDefinition = {
      ...prize,
      usage: prize.usage + 1,
      updatedAt: Date.now(),
    };
    const prizes = [...prizeStore.prizes];
    prizes[prizeIdx] = updatedPrize;
    savePrizeStore(prizes);

    const redemption: PrizeRedemptionRecord = {
      redemptionId: randomUUID(),
      roomId: state.roomId,
      quizFilename: state.quizFilename,
      playerId,
      playerName: player.name,
      playerEmoji: player.emoji,
      finalScore: player.score,
      prizeId: updatedPrize.id,
      prizeNameSnapshot: updatedPrize.name,
      prizeUrlSnapshot: updatedPrize.url,
      redeemedAt: Date.now(),
      status: 'revealed',
    };
    savePrizeRedemptionStore([...redemptionStore.redemptions, redemption]);
    return redemption;
  });
}

export function getRedemptionById(redemptionId: string): PrizeRedemptionRecord | undefined {
  return loadPrizeRedemptionStore().redemptions.find((redemption) => redemption.redemptionId === redemptionId);
}

export async function markRedemptionEmailed(redemptionId: string): Promise<void> {
  return withPrizeMutationLock(() => {
    const store = loadPrizeRedemptionStore();
    const idx = store.redemptions.findIndex((redemption) => redemption.redemptionId === redemptionId);
    if (idx < 0) {
      throw new Error('Redemption not found');
    }
    const next = [...store.redemptions];
    next[idx] = { ...next[idx], status: 'emailed' };
    savePrizeRedemptionStore(next);
  });
}

export async function sendPrizeEmail(params: { redemptionId: string; email: string }): Promise<void> {
  const redemption = getRedemptionById(params.redemptionId);
  if (!redemption) {
    throw new Error('Redemption not found');
  }
  const config = loadConfig();
  const transportConfig = getPrizeEmailTransportConfig(config);
  if (!transportConfig) {
    throw new Error('Prize email transport is not configured');
  }
  const transporter = nodemailer.createTransport({
    host: transportConfig.host,
    port: transportConfig.port,
    secure: transportConfig.secure,
    auth: {
      user: transportConfig.username,
      pass: transportConfig.password,
    },
  });

  await transporter.sendMail({
    from: buildPrizeEmailFrom(transportConfig),
    to: params.email,
    subject: `Your prize: ${redemption.prizeNameSnapshot}`,
    text: `Here is your prize link for ${redemption.prizeNameSnapshot}:\n\n${redemption.prizeUrlSnapshot}\n`,
  });
  await markRedemptionEmailed(redemption.redemptionId);
}
