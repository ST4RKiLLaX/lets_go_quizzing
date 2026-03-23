import { afterEach, expect, test } from 'vitest';
import { getConfiguredPlayerJoinMax } from '../src/lib/server/rate-limit.js';

const ORIGINAL_LOAD_TEST_PLAYER_JOIN_MAX = process.env.LOAD_TEST_PLAYER_JOIN_MAX;

afterEach(() => {
  if (ORIGINAL_LOAD_TEST_PLAYER_JOIN_MAX == null) {
    delete process.env.LOAD_TEST_PLAYER_JOIN_MAX;
  } else {
    process.env.LOAD_TEST_PLAYER_JOIN_MAX = ORIGINAL_LOAD_TEST_PLAYER_JOIN_MAX;
  }
});

test('getConfiguredPlayerJoinMax returns default limit when override is unset', () => {
  delete process.env.LOAD_TEST_PLAYER_JOIN_MAX;
  expect(getConfiguredPlayerJoinMax()).toBe(10);
});

test('getConfiguredPlayerJoinMax uses valid env override', () => {
  process.env.LOAD_TEST_PLAYER_JOIN_MAX = '250';
  expect(getConfiguredPlayerJoinMax()).toBe(250);
});

test('getConfiguredPlayerJoinMax ignores invalid env override', () => {
  process.env.LOAD_TEST_PLAYER_JOIN_MAX = '0';
  expect(getConfiguredPlayerJoinMax()).toBe(10);
});
