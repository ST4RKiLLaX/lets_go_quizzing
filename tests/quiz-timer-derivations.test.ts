import { expect, test } from 'vitest';
import type { SerializedState } from '../src/lib/types/game.js';
import {
  getClockOffsetMs,
  getSerializedTimerEndsAt,
  isSerializedActiveQuizPhase,
} from '../src/lib/utils/quiz-timer-derivations.js';

function stateWithType(type: SerializedState['type'], timerEndsAt?: number): SerializedState {
  return { type, timerEndsAt } as SerializedState;
}

test('getSerializedTimerEndsAt only returns timer for active quiz phases', () => {
  expect(getSerializedTimerEndsAt(stateWithType('Question', 12345))).toBe(12345);
  expect(getSerializedTimerEndsAt(stateWithType('RevealAnswer', 67890))).toBe(67890);
  expect(getSerializedTimerEndsAt(stateWithType('Lobby', 999))).toBeUndefined();
  expect(getSerializedTimerEndsAt(null)).toBeUndefined();
});

test('isSerializedActiveQuizPhase only marks question and reveal answer as active', () => {
  expect(isSerializedActiveQuizPhase(stateWithType('Question'))).toBe(true);
  expect(isSerializedActiveQuizPhase(stateWithType('RevealAnswer'))).toBe(true);
  expect(isSerializedActiveQuizPhase(stateWithType('Lobby'))).toBe(false);
  expect(isSerializedActiveQuizPhase(stateWithType('End'))).toBe(false);
  expect(isSerializedActiveQuizPhase(null)).toBe(false);
});

test('getClockOffsetMs computes offset and handles missing serverNow', () => {
  expect(getClockOffsetMs(10_000, 9_500)).toBe(500);
  expect(getClockOffsetMs(undefined, 9_500)).toBe(0);
  expect(getClockOffsetMs(null, 9_500)).toBe(0);
});
