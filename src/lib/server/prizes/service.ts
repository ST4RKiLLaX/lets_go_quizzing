import { createHash, createHmac, randomUUID } from 'node:crypto';
import { loadConfig, type AppConfig } from '../config.js';
import type { GameState } from '../game/state-machine.js';
import { listRooms } from '../game/rooms.js';
import type {
  ClaimedPrize,
  PrizeDefinition,
  PrizeClaimResult,
  PrizeEligibility,
  PrizeOption,
  PrizeRedemptionRecord,
  PrizeTier,
  RoomPrizeConfig,
  RoomPrizeDefaultConfig,
} from '../../types/prizes.js';
import { toPrizeOption } from '../../prizes/options.js';
import { normalizePrizeTiers } from '../../prizes/tiers.js';
import { RoomPrizeConfigSchema, RoomPrizeDefaultConfigSchema } from './schema.js';
import { loadPrizeRedemptionStore, loadPrizeStore, savePrizeRedemptionStore, savePrizeStore, withPrizeMutationLock } from './store.js';
import {
  buildPrizeEmailHtml,
  buildPrizeEmailText,
  buildPrizeEmailFrom,
  createPrizeEmailTransporter,
  getPrizeEmailStatus,
  getPrizeEmailTransportConfig,
} from './email.js';

type PrizeTierInput = {
  minScore: number;
  prizeIds?: string[];
  prizeId?: string;
  label?: string;
};

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

function roomPrizeConfigReferencesPrize(roomPrizeConfig: RoomPrizeConfig | undefined, prizeId: string): boolean {
  return normalizePrizeTiers(roomPrizeConfig?.tiers ?? []).some((tier) => tier.prizeIds.includes(prizeId));
}

function getPrizeDeletionReferenceError(prizeId: string): string | undefined {
  const config = loadConfig();
  if (roomPrizeConfigReferencesPrize(config?.defaultRoomPrizeConfig && {
    enabled: config.defaultRoomPrizeConfig.enabledByDefault,
    tiers: config.defaultRoomPrizeConfig.tiers,
    configuredAt: 0,
    configuredBy: 'default',
  }, prizeId)) {
    return 'Prize is still used by the default room prize setup. Remove it from settings tiers first.';
  }

  const referencingRoomIds = listRooms()
    .filter((room) => roomPrizeConfigReferencesPrize(room.roomPrizeConfig, prizeId))
    .map((room) => room.roomId);
  if (referencingRoomIds.length > 0) {
    return `Prize is still assigned in room prizes for: ${referencingRoomIds.join(', ')}`;
  }

  return undefined;
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

export function isPrizeFeatureEnabled(config: AppConfig | null | undefined): boolean {
  return config?.prizesEnabled === true;
}

export function isPrizeEmailEnabled(config: AppConfig | null | undefined): boolean {
  return getPrizeEmailStatus(config).availableNow;
}

export function isPrizeEmailTransportConfigured(config: AppConfig | null | undefined): boolean {
  return getPrizeEmailStatus(config).transportConfigured;
}

export function getPrizeEmailPolicy(config: AppConfig | null | undefined) {
  return getPrizeEmailStatus(config);
}

export async function testPrizeEmailTransport(config: AppConfig | null | undefined): Promise<void> {
  const transporter = createPrizeEmailTransporter(config);
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
    tiers: normalizePrizeTiers(parsed.data.tiers),
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
  raw: { enabled?: boolean; tiers?: PrizeTierInput[] } | undefined,
  configuredBy: string
): RoomPrizeConfig | undefined {
  if (!raw?.enabled) return undefined;
  const tiers = normalizePrizeTiers(raw.tiers ?? []);
  if (tiers.length === 0) return undefined;
  const configuredAt = Date.now();
  RoomPrizeConfigSchema.parse({
    enabled: true,
    tiers,
    configuredAt,
    configuredBy,
  });
  return {
    enabled: true,
    tiers,
    configuredAt,
    configuredBy,
  };
}

export function listPrizeOptions(): PrizeOption[] {
  return loadPrizeStore()
    .prizes.filter((prize) => prize.active && !isPrizeExpired(prize))
    .map(toPrizeOption)
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
    const referenceError = getPrizeDeletionReferenceError(prizeId);
    if (referenceError) {
      throw new Error(referenceError);
    }
    savePrizeStore(store.prizes.filter((entry) => entry.id !== prizeId));
  });
}

function getClaimId(redemption: PrizeRedemptionRecord): string {
  return redemption.claimId ?? redemption.redemptionId;
}

function toClaimedPrize(redemption: PrizeRedemptionRecord): ClaimedPrize {
  return {
    redemptionId: redemption.redemptionId,
    prizeId: redemption.prizeId,
    prizeName: redemption.prizeNameSnapshot,
    prizeUrl: redemption.prizeUrlSnapshot,
    status: redemption.status,
  };
}

function buildPrizeClaimResult(redemptions: PrizeRedemptionRecord[], bestTier: PrizeTier): PrizeClaimResult {
  if (redemptions.length === 0) {
    throw new Error('Claim redemptions are required');
  }
  const first = redemptions[0];
  return {
    claimId: getClaimId(first),
    roomId: first.roomId,
    playerId: first.playerId,
    playerName: first.playerName,
    playerEmoji: first.playerEmoji,
    finalScore: first.finalScore,
    bestTier,
    prizes: redemptions.map(toClaimedPrize),
  };
}

function getPlayerClaimRedemptions(roomId: string, playerId: string): PrizeRedemptionRecord[] {
  const redemptions = loadPrizeRedemptionStore().redemptions
    .filter((redemption) => redemption.roomId === roomId && redemption.playerId === playerId)
    .sort((a, b) => a.redeemedAt - b.redeemedAt);
  return redemptions;
}

function getBestEligibleTier(config: RoomPrizeConfig | undefined, score: number): PrizeTier | undefined {
  if (!config?.enabled) return undefined;
  return normalizePrizeTiers(config.tiers).find((tier) => score >= tier.minScore);
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
  const prizes = loadPrizeStore().prizes.filter(
    (entry) => tier.prizeIds.includes(entry.id) && entry.active && !isPrizeExpired(entry)
  );
  if (prizes.length !== tier.prizeIds.length) {
    return { eligible: false, reason: 'prize_missing' };
  }
  const existing = getPlayerClaimRedemptions(state.roomId, playerId);
  if (existing.length > 0) {
    return {
      eligible: false,
      reason: 'already_claimed',
      bestTier: tier,
      prizes: prizes.map((prize) => ({ id: prize.id, name: prize.name })),
      claim: buildPrizeClaimResult(existing, tier),
    };
  }
  return {
    eligible: true,
    bestTier: tier,
    prizes: prizes.map((prize) => ({ id: prize.id, name: prize.name })),
  };
}

export async function claimPrizeForPlayer(state: GameState, playerId: string, config: AppConfig | null): Promise<PrizeClaimResult> {
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
    const existing = redemptionStore.redemptions
      .filter((redemption) => redemption.roomId === state.roomId && redemption.playerId === playerId)
      .sort((a, b) => a.redeemedAt - b.redeemedAt);
    if (existing.length > 0) {
      return buildPrizeClaimResult(existing, tier);
    }

    const prizeStore = loadPrizeStore();
    const prizeMatches = tier.prizeIds.map((prizeId) => {
      const prizeIdx = prizeStore.prizes.findIndex((entry) => entry.id === prizeId);
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
      return { prizeIdx, prize };
    });

    const prizes = [...prizeStore.prizes];
    const redeemedAt = Date.now();
    for (const { prizeIdx, prize } of prizeMatches) {
      const updatedPrize: PrizeDefinition = {
        ...prize,
        usage: prize.usage + 1,
        updatedAt: redeemedAt,
      };
      prizes[prizeIdx] = updatedPrize;
    }
    savePrizeStore(prizes);

    const claimId = randomUUID();
    const redemptions: PrizeRedemptionRecord[] = prizeMatches.map(({ prize }) => ({
      claimId,
      redemptionId: randomUUID(),
      roomId: state.roomId,
      quizFilename: state.quizFilename,
      playerId,
      playerName: player.name,
      playerEmoji: player.emoji,
      finalScore: player.score,
      prizeId: prize.id,
      prizeNameSnapshot: prize.name,
      prizeUrlSnapshot: prize.url,
      redeemedAt,
      status: 'revealed',
    }));
    savePrizeRedemptionStore([...redemptionStore.redemptions, ...redemptions]);
    return buildPrizeClaimResult(redemptions, tier);
  });
}

function getClaimRedemptionsById(claimId: string): PrizeRedemptionRecord[] {
  return loadPrizeRedemptionStore().redemptions
    .filter((redemption) => getClaimId(redemption) === claimId)
    .sort((a, b) => a.redeemedAt - b.redeemedAt);
}

export async function markClaimEmailed(claimId: string): Promise<void> {
  return withPrizeMutationLock(() => {
    const store = loadPrizeRedemptionStore();
    const indexes = store.redemptions
      .map((redemption, index) => ({ redemption, index }))
      .filter(({ redemption }) => getClaimId(redemption) === claimId)
      .map(({ index }) => index);
    if (indexes.length === 0) {
      throw new Error('Prize claim not found');
    }
    const next = [...store.redemptions];
    for (const index of indexes) {
      next[index] = { ...next[index], status: 'emailed' };
    }
    savePrizeRedemptionStore(next);
  });
}

export async function sendPrizeEmail(params: { claimId: string; email: string }): Promise<void> {
  const redemptions = getClaimRedemptionsById(params.claimId);
  if (redemptions.length === 0) {
    throw new Error('Prize claim not found');
  }
  const prizes = redemptions.map(toClaimedPrize);
  const config = loadConfig();
  const transportConfig = getPrizeEmailTransportConfig(config);
  if (!transportConfig) {
    throw new Error('Prize email transport is not configured');
  }
  const transporter = createPrizeEmailTransporter(config);

  await transporter.sendMail({
    from: buildPrizeEmailFrom(transportConfig),
    to: params.email,
    subject:
      prizes.length === 1
        ? `Your prize: ${prizes[0].prizeName}`
        : `Your prizes from Let's Go Quizzing`,
    text: buildPrizeEmailText({
      prizes: prizes.map((prize) => ({
        prizeName: prize.prizeName,
        prizeUrl: prize.prizeUrl,
      })),
    }),
    html: buildPrizeEmailHtml({
      prizes: prizes.map((prize) => ({
        prizeName: prize.prizeName,
        prizeUrl: prize.prizeUrl,
      })),
    }),
  });
  await markClaimEmailed(params.claimId);
}
