import { afterEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createConfigAtomic, loadConfig } from '../src/lib/server/config.js';
import { setRoom } from '../src/lib/server/game/rooms.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import { createPrizeClaimToken, createRoomPrizeConfig } from '../src/lib/server/prizes/service.js';
import { savePrizeRedemptionStore, savePrizeStore } from '../src/lib/server/prizes/store.js';
import { GET as eligibilityGet } from '../src/routes/api/prizes/eligibility/+server.js';
import { POST as claimPost } from '../src/routes/api/prizes/claim/+server.js';
import { createTempCwdHarness } from './helpers/fs-isolation.js';

const fsHarness = createTempCwdHarness('lgq-prize-claim-routes-');

function writeConfig(prizesEnabled: boolean) {
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
    prizesEnabled,
    prizeEmailEnabled: false,
  });
}

function makeEndState(roomId: string, playerId: string): GameState {
  const roomPrizeConfig = createRoomPrizeConfig(
    {
      enabled: true,
      tiers: [{ awardBy: 'score', minScore: 50, prizeIds: ['course-pro'] }],
    },
    'host'
  );
  return {
    type: 'End',
    roomId,
    quiz: {
      meta: { name: 'Prize Quiz', default_timer: 30 },
      rounds: [{ name: 'Round 1', questions: [{ id: 'q1', type: 'choice', text: 'Q', options: ['A', 'B'], answer: 0 }] }],
    },
    quizFilename: 'test.yaml',
    hostSocketId: 'host',
    players: new Map([
      [playerId, { id: playerId, name: 'Ana', emoji: '😀', score: 75, totalAnswerTimeMs: 2000, socketId: 'sock-1' }],
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
    startedAt: 12345,
  };
}

function setupPrizeStore() {
  savePrizeStore([
    {
      id: 'course-pro',
      name: 'Pro Course',
      url: 'https://example.com/pro',
      limit: 5,
      usage: 0,
      expirationDate: '2099-12-31',
      active: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  savePrizeRedemptionStore([]);
}

afterEach(() => {
  fsHarness.cleanup();
});

test('claim and eligibility reflect feature-disabled behavior asymmetry', async () => {
  fsHarness.prepare();
  writeConfig(false);

  const claimRes = await claimPost({
    request: new Request('http://localhost/api/prizes/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'r1', playerId: 'p1', token: 'x.y' }),
    }),
  } as Parameters<typeof claimPost>[0]);
  expect(claimRes.status).toBe(404);
  expect(await claimRes.json()).toEqual({ error: 'Prize feature disabled' });

  const eligibilityRes = await eligibilityGet({
    url: new URL('http://localhost/api/prizes/eligibility?roomId=r1&playerId=p1&token=x.y'),
  } as Parameters<typeof eligibilityGet>[0]);
  expect(eligibilityRes.status).toBe(200);
  expect(await eligibilityRes.json()).toEqual({
    enabled: false,
    eligible: false,
    emailConfigured: false,
    emailAvailableNow: false,
  });
});

test('claim and eligibility require roomId, playerId, and token', async () => {
  fsHarness.prepare();
  writeConfig(true);

  const claimRes = await claimPost({
    request: new Request('http://localhost/api/prizes/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: ' ', playerId: 'p1', token: '' }),
    }),
  } as Parameters<typeof claimPost>[0]);
  expect(claimRes.status).toBe(400);
  expect(await claimRes.json()).toEqual({ error: 'roomId, playerId, and token are required' });

  const eligibilityRes = await eligibilityGet({
    url: new URL('http://localhost/api/prizes/eligibility?roomId=r1'),
  } as Parameters<typeof eligibilityGet>[0]);
  expect(eligibilityRes.status).toBe(400);
  expect(await eligibilityRes.json()).toEqual({ error: 'roomId, playerId, and token are required' });
});

test('unknown room differs between claim and eligibility routes', async () => {
  fsHarness.prepare();
  writeConfig(true);

  const claimRes = await claimPost({
    request: new Request('http://localhost/api/prizes/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'missing-room', playerId: 'p1', token: 'x.y' }),
    }),
  } as Parameters<typeof claimPost>[0]);
  expect(claimRes.status).toBe(404);
  expect(await claimRes.json()).toEqual({ error: 'Room not found' });

  const eligibilityRes = await eligibilityGet({
    url: new URL('http://localhost/api/prizes/eligibility?roomId=missing-room&playerId=p1&token=x.y'),
  } as Parameters<typeof eligibilityGet>[0]);
  expect(eligibilityRes.status).toBe(200);
  expect(await eligibilityRes.json()).toMatchObject({
    enabled: true,
    eligible: false,
    reason: 'not_eligible',
  });
});

test('invalid token differs between claim and eligibility routes', async () => {
  fsHarness.prepare();
  writeConfig(true);
  setupPrizeStore();
  const roomId = `ROOM_${randomUUID().slice(0, 8)}`;
  const playerId = 'p1';
  const state = makeEndState(roomId, playerId);
  setRoom(roomId, state);

  const claimRes = await claimPost({
    request: new Request('http://localhost/api/prizes/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, playerId, token: 'invalid.token' }),
    }),
  } as Parameters<typeof claimPost>[0]);
  expect(claimRes.status).toBe(403);
  expect(await claimRes.json()).toEqual({ error: 'Invalid prize claim token' });

  const eligibilityRes = await eligibilityGet({
    url: new URL(`http://localhost/api/prizes/eligibility?roomId=${roomId}&playerId=${playerId}&token=invalid.token`),
  } as Parameters<typeof eligibilityGet>[0]);
  expect(eligibilityRes.status).toBe(200);
  expect(await eligibilityRes.json()).toMatchObject({
    enabled: true,
    eligible: false,
    reason: 'not_eligible',
  });
});

test('valid token yields successful claim and eligible response', async () => {
  fsHarness.prepare();
  writeConfig(true);
  setupPrizeStore();
  const roomId = `ROOM_${randomUUID().slice(0, 8)}`;
  const playerId = 'p1';
  const state = makeEndState(roomId, playerId);
  setRoom(roomId, state);
  const validToken = createPrizeClaimToken({
    roomId,
    playerId,
    finalScore: state.players.get(playerId)!.score,
    quizFilename: state.quizFilename,
    startedAt: state.startedAt,
    config: loadConfig(),
  });
  expect(validToken).toBeTruthy();

  const eligibilityBeforeClaimRes = await eligibilityGet({
    url: new URL(`http://localhost/api/prizes/eligibility?roomId=${roomId}&playerId=${playerId}&token=${validToken}`),
  } as Parameters<typeof eligibilityGet>[0]);
  expect(eligibilityBeforeClaimRes.status).toBe(200);
  const eligibilityBeforeClaimData = await eligibilityBeforeClaimRes.json();
  expect(eligibilityBeforeClaimData.enabled).toBe(true);
  expect(eligibilityBeforeClaimData.eligible).toBe(true);

  const claimRes = await claimPost({
    request: new Request('http://localhost/api/prizes/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, playerId, token: validToken }),
    }),
  } as Parameters<typeof claimPost>[0]);
  expect(claimRes.status).toBe(200);
  const claimData = await claimRes.json();
  expect(claimData.ok).toBe(true);
  expect(claimData.claimId).toBeTypeOf('string');

  const eligibilityAfterClaimRes = await eligibilityGet({
    url: new URL(`http://localhost/api/prizes/eligibility?roomId=${roomId}&playerId=${playerId}&token=${validToken}`),
  } as Parameters<typeof eligibilityGet>[0]);
  expect(eligibilityAfterClaimRes.status).toBe(200);
  const eligibilityAfterClaimData = await eligibilityAfterClaimRes.json();
  expect(eligibilityAfterClaimData.enabled).toBe(true);
  expect(eligibilityAfterClaimData.reason).toBe('already_claimed');
});
