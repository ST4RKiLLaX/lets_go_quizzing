import { test, expect } from 'vitest';
import { mapHostCreateError, resolveHostCreatePassword } from '../src/lib/auth/host-create.js';
import { createSettlementGuard } from '../src/lib/utils/settlement-guard.js';

test('resolveHostCreatePassword returns undefined when host auth not required', () => {
  expect(resolveHostCreatePassword(false, 'secret')).toBeUndefined();
});

test('resolveHostCreatePassword returns trimmed password when required', () => {
  expect(resolveHostCreatePassword(true, '  secret  ')).toBe('secret');
});

test('resolveHostCreatePassword returns undefined for empty password', () => {
  expect(resolveHostCreatePassword(true, '   ')).toBeUndefined();
});

test('mapHostCreateError forces re-auth on Invalid password', () => {
  expect(mapHostCreateError('Invalid password')).toEqual({
    clearAuthenticated: true,
    message: 'Session expired. Enter host password again.',
  });
});

test('mapHostCreateError preserves non-auth errors', () => {
  expect(mapHostCreateError('Too many attempts')).toEqual({
    clearAuthenticated: false,
    message: 'Too many attempts',
  });
});

test('createSettlementGuard runs settle callback only once', () => {
  let called = 0;
  const settle = createSettlementGuard(() => {
    called += 1;
  });
  expect(settle()).toBe(true);
  expect(settle()).toBe(false);
  expect(settle()).toBe(false);
  expect(called).toBe(1);
});
