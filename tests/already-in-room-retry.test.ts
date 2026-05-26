import { describe, expect, test } from 'vitest';
import {
  ALREADY_IN_ROOM_ERROR,
  ALREADY_IN_ROOM_RETRY_DELAY_MS,
  decideAlreadyInRoomRetry,
} from '../src/lib/player/already-in-room-retry.js';

describe('decideAlreadyInRoomRetry', () => {
  test('retries once on first occurrence when not blocked', () => {
    expect(
      decideAlreadyInRoomRetry({
        errorMessage: ALREADY_IN_ROOM_ERROR,
        alreadyAttempted: false,
        blocked: false,
      })
    ).toEqual({ shouldRetry: true, shouldSurfaceError: false });
  });

  test('surfaces error after one attempt', () => {
    expect(
      decideAlreadyInRoomRetry({
        errorMessage: ALREADY_IN_ROOM_ERROR,
        alreadyAttempted: true,
        blocked: false,
      })
    ).toEqual({ shouldRetry: false, shouldSurfaceError: true });
  });

  test('does not retry when blocked (kicked or session_replaced)', () => {
    expect(
      decideAlreadyInRoomRetry({
        errorMessage: ALREADY_IN_ROOM_ERROR,
        alreadyAttempted: false,
        blocked: true,
      })
    ).toEqual({ shouldRetry: false, shouldSurfaceError: true });
  });

  test('ignores unrelated errors', () => {
    expect(
      decideAlreadyInRoomRetry({
        errorMessage: 'Invalid room password',
        alreadyAttempted: false,
        blocked: false,
      })
    ).toEqual({ shouldRetry: false, shouldSurfaceError: false });
  });

  test('exports the documented 800ms backoff', () => {
    expect(ALREADY_IN_ROOM_RETRY_DELAY_MS).toBe(800);
  });
});
