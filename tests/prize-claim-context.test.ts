import { afterEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createConfigAtomic, loadConfig } from '../src/lib/server/config.js';
import { setRoom } from '../src/lib/server/game/rooms.js';
import type { GameState } from '../src/lib/server/game/state-machine.js';
import {
  parsePrizeClaimIdsFromBody,
  parsePrizeClaimIdsFromUrl,
  resolveVerifiedPrizeClaimContext,
} from '../src/lib/server/prizes/claim-context.js';
import { createPrizeClaimToken, createRoomPrizeConfig } from '../src/lib/server/prizes/service.js';
import { createTempCwdHarness } from './helpers/fs-isolation.js';

const fsHarness = createTempCwdHarness('lgq-prize-claim-context-');

function writeConfig() {
  createConfigAtomic({
    adminUsername: 'admin',
    adminPasswordHash: 'salt:hash',
    prizesEnabled: true,
    prizeEmailEnabled: false,
  });
}

function makeEndState(roomId: string, playerId: string): GameState {
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
    roomPrizeConfig: createRoomPrizeConfig(
      {
        enabled: true,
        tiers: [{ awardBy: 'score', minScore: 50, prizeIds: ['course-pro'] }],
      },
      'host'
    ),
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
    startedAt: 12345,
  };
}

afterEach(() => {
  fsHarness.cleanup();
});

test('parses claim ids from body and url', () => {
  const fromBody = parsePrizeClaimIdsFromBody({
    roomId: ' ROOM1 ',
    playerId: ' p1 ',
    token: ' abc.def ',
  });
  expect(fromBody).toEqual({
    roomId: 'ROOM1',
    playerId: 'p1',
    token: 'abc.def',
  });

  const fromUrl = parsePrizeClaimIdsFromUrl(
    new URL('http://localhost/api/prizes/eligibility?roomId=ROOM1&playerId=p1&token=abc.def')
  );
  expect(fromUrl).toEqual({
    roomId: 'ROOM1',
    playerId: 'p1',
    token: 'abc.def',
  });
});

test('returns null when body or url ids are missing', () => {
  expect(parsePrizeClaimIdsFromBody({ roomId: 'ROOM1', playerId: 'p1' })).toBeNull();
  expect(parsePrizeClaimIdsFromBody({ roomId: '', playerId: 'p1', token: 'abc.def' })).toBeNull();
  expect(parsePrizeClaimIdsFromUrl(new URL('http://localhost/api/prizes/eligibility?roomId=ROOM1'))).toBeNull();
});

test('resolves room-not-found and token-invalid outcomes', () => {
  fsHarness.prepare();
  writeConfig();
  const config = loadConfig();

  const missing = resolveVerifiedPrizeClaimContext(config, {
    roomId: 'missing-room',
    playerId: 'p1',
    token: 'abc.def',
  });
  expect(missing).toEqual({ ok: false, reason: 'room_not_found' });

  const roomId = `ROOM_${randomUUID().slice(0, 8)}`;
  const playerId = 'p1';
  setRoom(roomId, makeEndState(roomId, playerId));
  const invalid = resolveVerifiedPrizeClaimContext(config, {
    roomId,
    playerId,
    token: 'invalid.token',
  });
  expect(invalid).toEqual({ ok: false, reason: 'token_invalid' });
});

test('resolves verified context for valid token', () => {
  fsHarness.prepare();
  writeConfig();
  const config = loadConfig();
  const roomId = `ROOM_${randomUUID().slice(0, 8)}`;
  const playerId = 'p1';
  const state = makeEndState(roomId, playerId);
  setRoom(roomId, state);
  const token = createPrizeClaimToken({
    roomId,
    playerId,
    finalScore: state.players.get(playerId)!.score,
    quizFilename: state.quizFilename,
    startedAt: state.startedAt,
    config,
  });

  const resolved = resolveVerifiedPrizeClaimContext(config, {
    roomId,
    playerId,
    token: token!,
  });

  expect(resolved.ok).toBe(true);
  if (resolved.ok) {
    expect(resolved.state.roomId).toBe(roomId);
    expect(resolved.player.id).toBe(playerId);
  }
});
