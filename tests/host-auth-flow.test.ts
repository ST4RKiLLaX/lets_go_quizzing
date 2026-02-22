import assert from 'node:assert/strict';
import test from 'node:test';
import { mapHostCreateError, resolveHostCreatePassword } from '../src/lib/auth/host-create.js';
import { createSettlementGuard } from '../src/lib/utils/settlement-guard.js';

test('resolveHostCreatePassword returns undefined when host auth not required', () => {
  assert.equal(resolveHostCreatePassword(false, 'secret'), undefined);
});

test('resolveHostCreatePassword returns trimmed password when required', () => {
  assert.equal(resolveHostCreatePassword(true, '  secret  '), 'secret');
});

test('resolveHostCreatePassword returns undefined for empty password', () => {
  assert.equal(resolveHostCreatePassword(true, '   '), undefined);
});

test('mapHostCreateError forces re-auth on Invalid password', () => {
  assert.deepEqual(mapHostCreateError('Invalid password'), {
    clearAuthenticated: true,
    message: 'Session expired. Enter host password again.',
  });
});

test('mapHostCreateError preserves non-auth errors', () => {
  assert.deepEqual(mapHostCreateError('Too many attempts'), {
    clearAuthenticated: false,
    message: 'Too many attempts',
  });
});

test('createSettlementGuard runs settle callback only once', () => {
  let called = 0;
  const settle = createSettlementGuard(() => {
    called += 1;
  });
  assert.equal(settle(), true);
  assert.equal(settle(), false);
  assert.equal(settle(), false);
  assert.equal(called, 1);
});
