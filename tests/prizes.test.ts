import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../src/lib/server/config.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import {
  claimPrizeForPlayer,
  createRoomPrizeConfig,
  generatePrizeId,
  getPrizeEligibility,
  listPrizeOptions,
} from '../src/lib/server/prizes/service.js';
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
    { id: 'course-basic', name: 'Basic Course' },
    { id: 'course-pro', name: 'Pro Course' },
  ]);
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
