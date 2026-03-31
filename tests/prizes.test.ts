import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../src/lib/server/config.js';
import { createConfigAtomic } from '../src/lib/server/config.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import { buildPrizeEmailHtml, buildPrizeEmailText } from '../src/lib/server/prizes/email.js';
import { findUnavailablePrizeId } from '../src/lib/prizes/config-validation.js';
import { normalizePrizeTiers } from '../src/lib/prizes/tiers.js';
import {
  claimPrizeForPlayer,
  createRoomPrizeConfig,
  deletePrize,
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
        { minScore: 50, prizeIds: ['course-pro', 'course-basic'] },
        { minScore: 20, prizeIds: ['course-basic'] },
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
      { minScore: 5.9, prizeIds: [' low ', ' bonus ', 'low'], label: '  Bronze  ' },
      { minScore: 20, prizeId: 'high', label: ' Gold ' },
      { minScore: -5, prizeId: '   ', label: 'ignored' },
    ])
  ).toEqual([
    { minScore: 20, prizeIds: ['high'], label: 'Gold' },
    { minScore: 5, prizeIds: ['low', 'bonus'], label: 'Bronze' },
  ]);
});

test('findUnavailablePrizeId flags missing or exhausted prize assignments', () => {
  const tiers = normalizePrizeTiers([
    { minScore: 10, prizeIds: ['course-pro', 'course-basic'] },
  ]);

  expect(findUnavailablePrizeId(tiers, [
    { id: 'course-pro', name: 'Pro Course', remainingQuantity: 1 },
    { id: 'course-basic', name: 'Basic Course', remainingQuantity: 0 },
  ])).toBe('course-basic');
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

test('multi-prize email templates include one button per prize and host contact guidance', () => {
  const input = {
    prizes: [
      { prizeName: 'Pro Course', prizeUrl: 'https://example.com/prize' },
      { prizeName: 'VIP Pass', prizeUrl: 'https://example.com/vip' },
    ],
  };

  const text = buildPrizeEmailText(input);
  const html = buildPrizeEmailHtml(input);

  expect(text).toContain('https://example.com/prize');
  expect(text).toContain('https://example.com/vip');
  expect(text).toContain('Please contact the quiz host for more information.');
  expect(text).toContain("Let's Go Quizzing and the app maker are not responsible for prize delivery.");

  expect((html.match(/Open Prize Link/g) ?? []).length).toBe(2);
  expect(html).toContain('https://example.com/prize');
  expect(html).toContain('https://example.com/vip');
  expect(html).toContain('Please contact the quiz host.');
  expect(html).toContain("Let's Go Quizzing and the app maker are not responsible for prize delivery.");
});

test('single-prize email template uses the normal prize button label', () => {
  const html = buildPrizeEmailHtml({
    prizes: [{ prizeName: 'Pro Course', prizeUrl: 'https://example.com/prize' }],
  });

  expect(html).toContain('Open Prize Link');
  expect(html).not.toContain('Open First Prize Link');
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

test('claimPrizeForPlayer auto-claims all prizes in the best tier and is idempotent', async () => {
  prepareTempData();
  const state = makeState();

  const claim = await claimPrizeForPlayer(state, 'p1', makeConfig());

  expect(claim.prizes.map((prize) => prize.prizeId)).toEqual(['course-pro', 'course-basic']);
  expect(claim.prizes.map((prize) => prize.prizeUrl)).toEqual([
    'https://example.com/pro',
    'https://example.com/basic',
  ]);

  const repeatedClaim = await claimPrizeForPlayer(state, 'p1', makeConfig());
  expect(repeatedClaim.claimId).toBe(claim.claimId);
  expect(repeatedClaim.prizes).toHaveLength(2);
});

test('getPrizeEligibility returns grouped claimed prizes after auto-claim', async () => {
  prepareTempData();
  const state = makeState();

  await claimPrizeForPlayer(state, 'p1', makeConfig());

  const eligibility = getPrizeEligibility(state, 'p1', makeConfig());
  expect(eligibility.reason).toBe('already_claimed');
  expect(eligibility.claim?.prizes.map((prize) => prize.prizeId)).toEqual(['course-pro', 'course-basic']);
});

test('deletePrize allows deleting prizes that already have usage history', async () => {
  prepareTempData();
  const state = makeState();

  await claimPrizeForPlayer(state, 'p1', makeConfig());
  await expect(deletePrize('course-pro')).resolves.toBeUndefined();

  expect(listPrizeOptions()).toEqual([{ id: 'course-basic', name: 'Basic Course', remainingQuantity: 4 }]);
});

test('deletePrize blocks deletion when prize is still referenced by default tiers', async () => {
  prepareTempData();
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
    prizesEnabled: true,
    defaultRoomPrizeConfig: {
      enabledByDefault: true,
      tiers: [{ minScore: 10, prizeIds: ['course-pro'] }],
    },
  });

  await expect(deletePrize('course-pro')).rejects.toThrow(
    'Prize is still used by the default room prize setup. Remove it from settings tiers first.'
  );
});

test('getPrizeEligibility rejects players before the game ends', () => {
  prepareTempData();
  const state = { ...makeState(), type: 'Scoreboard' as const };
  const eligibility = getPrizeEligibility(state, 'p1', makeConfig());
  expect(eligibility).toMatchObject({ eligible: false, reason: 'not_ready' });
});
