import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PrizeDefinition, PrizeRedemptionRecord } from '../../types/prizes.js';
import { PrizeDefinitionSchema, PrizeRedemptionRecordSchema, PrizeRedemptionStoreSchema, PrizeStoreSchema } from './schema.js';

let mutationQueue: Promise<void> = Promise.resolve();

function getDataDir(): string {
  return join(process.cwd(), 'data');
}

function getPrizesPath(): string {
  return join(getDataDir(), 'prizes.json');
}

function getRedemptionsPath(): string {
  return join(getDataDir(), 'prize-redemptions.json');
}

function ensureDataDir() {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  ensureDataDir();
  const tempPath = `${path}.tmp.${randomUUID()}`;
  try {
    writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
    renameSync(tempPath, path);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    throw error;
  }
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return raw as T;
}

export function loadPrizeStore(): { version: number; prizes: PrizeDefinition[] } {
  const raw = readJsonFile(getPrizesPath(), { version: 1, prizes: [] as PrizeDefinition[] });
  return PrizeStoreSchema.parse(raw);
}

export function savePrizeStore(prizes: PrizeDefinition[]): void {
  for (const prize of prizes) {
    PrizeDefinitionSchema.parse(prize);
  }
  writeJsonAtomic(getPrizesPath(), { version: 1, prizes });
}

export function loadPrizeRedemptionStore(): { version: number; redemptions: PrizeRedemptionRecord[] } {
  const raw = readJsonFile(getRedemptionsPath(), { version: 1, redemptions: [] as PrizeRedemptionRecord[] });
  return PrizeRedemptionStoreSchema.parse(raw);
}

export function savePrizeRedemptionStore(redemptions: PrizeRedemptionRecord[]): void {
  for (const redemption of redemptions) {
    PrizeRedemptionRecordSchema.parse(redemption);
  }
  writeJsonAtomic(getRedemptionsPath(), { version: 1, redemptions });
}

export async function withPrizeMutationLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const previous = mutationQueue;
  let release!: () => void;
  mutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
