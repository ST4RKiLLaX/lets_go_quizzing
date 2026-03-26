import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../src/lib/server/config.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import { normalizePrizeTiers } from '../src/lib/prizes/tiers.js';
import {
  claimPrizeForPlayer,
  createRoomPrizeConfig,
  generatePrizeId,
  getPrizeEmailPolicy,
  getPrizeEligibility,
  listPrizeOptions,
} from '../src/lib/server/prizes/service.js';
import { setPrizeEmailSmtpPassword } from '../src/lib/server/secrets.js';
import { savePrizeRedemptionStore, savePrizeStore } from '../src/lib/server/prizes/store.js';
import type { Quiz } from '../src/lib/server/storage/parser.js';

const ORIGINAL_CWD = process.cwd();
let tempDir: string | null = null;

function makeConfig(): AppConfig {
  return {
    version: 1,
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
    prizesEnabled: true,
    prizeEmailEnabled: false,
  };
}

function makeQuiz(): Quiz {
  return {
    meta: { name: 'Prize Quiz', default_timer: 30 },
    rounds: [{ name: 'Round 1', questions: [{ id: 'q1', type: 'choice', text: 'Q', options: ['A', 'B'], answer: 0 }] }],
  };
}

function makeState(): GameState {
  const roomPrizeConfig = createRoomPrizeConfig(
    {
      enabled: true,
      tiers: [
        { minScore: 50, prizeId: 'course-pro' },
        { minScore: 20, prizeId: 'course-basic' },
      ],
    },
    'host'
  )!;

  return {
    type: 'End',
    roomId: 'ROOM1',
    quiz: makeQuiz(),
    quizFilename: 'test.yaml',
    hostSocketId: 'host',
    players: new Map([
      ['p1', { id: 'p1', name: 'Ana', emoji: '😀', score: 55, socketId: 'sock-1' }],
    ]),
    pendingPlayers: new Map(),
    waitingRoomEnabled: false,
    allowLateJoin: false,
    autoAdmitBeforeGame: true,
    manualAdmitAfterGame: true,
    roomPrizeConfig,
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
  };
}

function prepareTempData() {
  tempDir = mkdtempSync(join(tmpdir(), 'lgq-prizes-'));
  process.chdir(tempDir);
  savePrizeStore([
    {
      id: 'course-pro',
      name: 'Pro Course',
      url: 'https://example.com/pro',
      limit: 1,
      expirationDate: '2099-12-31',
      usage: 0,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'course-basic',
      name: 'Basic Course',
      url: 'https://example.com/basic',
      limit: 5,
      expirationDate: '2099-12-31',
      usage: 0,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  savePrizeRedemptionStore([]);
}

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

test('listPrizeOptions only returns active prize labels', () => {
  prepareTempData();
  expect(listPrizeOptions()).toEqual([
    { id: 'course-basic', name: 'Basic Course', remainingQuantity: 5 },
    { id: 'course-pro', name: 'Pro Course', remainingQuantity: 1 },
  ]);
});

test('normalizePrizeTiers deterministically trims, filters, and sorts tiers', () => {
  expect(
    normalizePrizeTiers([
      { minScore: 5.9, prizeId: ' low ', label: '  Bronze  ' },
      { minScore: 20, prizeId: 'high', label: ' Gold ' },
      { minScore: -5, prizeId: '   ', label: 'ignored' },
    ])
  ).toEqual([
    { minScore: 20, prizeId: 'high', label: 'Gold' },
    { minScore: 5, prizeId: 'low', label: 'Bronze' },
  ]);
});

test('getPrizeEmailPolicy preserves feature intent separately from availability', () => {
  prepareTempData();
  const config: AppConfig = {
    ...makeConfig(),
    prizeEmailEnabled: true,
    prizeEmailSmtpHost: 'smtp.example.com',
    prizeEmailSmtpPort: 587,
    prizeEmailSmtpSecure: false,
    prizeEmailSmtpUsername: 'mailer@example.com',
    prizeEmailFromEmail: 'noreply@example.com',
  };

  expect(getPrizeEmailPolicy(config)).toEqual({
    featureEnabled: true,
    transportConfigured: false,
    availableNow: false,
  });

  setPrizeEmailSmtpPassword('smtp-secret');

  expect(getPrizeEmailPolicy(config)).toEqual({
    featureEnabled: true,
    transportConfigured: true,
    availableNow: true,
  });
});

test('generatePrizeId is deterministic from prize identity fields', () => {
  expect(
    generatePrizeId({
      name: 'Pro Course',
      url: 'https://example.com/pro',
      limit: 1,
      expirationDate: '2099-12-31',
      createdAt: 1234567890,
    })
  ).toBe(
    generatePrizeId({
      name: 'Pro Course',
      url: 'https://example.com/pro',
      limit: 1,
      expirationDate: '2099-12-31',
      createdAt: 1234567890,
    })
  );
});

test('generatePrizeId changes when createdAt changes', () => {
  expect(
    generatePrizeId({
      name: 'Pro Course',
      url: 'https://example.com/pro',
      limit: 1,
      expirationDate: '2099-12-31',
      createdAt: 1234567890,
    })
  ).not.toBe(
    generatePrizeId({
      name: 'Pro Course',
      url: 'https://example.com/pro',
      limit: 1,
      expirationDate: '2099-12-31',
      createdAt: 1234567891,
    })
  );
});

test('claimPrizeForPlayer consumes the best eligible tier once', async () => {
  prepareTempData();
  const state = makeState();

  const redemption = await claimPrizeForPlayer(state, 'p1', makeConfig());

  expect(redemption.prizeId).toBe('course-pro');
  expect(redemption.prizeUrlSnapshot).toBe('https://example.com/pro');

  await expect(claimPrizeForPlayer(state, 'p1', makeConfig())).rejects.toThrow('Prize already claimed');
});

test('getPrizeEligibility rejects players before the game ends', () => {
  prepareTempData();
  const state = { ...makeState(), type: 'Scoreboard' as const };
  const eligibility = getPrizeEligibility(state, 'p1', makeConfig());
  expect(eligibility).toMatchObject({ eligible: false, reason: 'not_ready' });
});
