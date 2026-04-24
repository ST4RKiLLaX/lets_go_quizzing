import { expect, test } from 'vitest';
import { toErrorMessage } from '../src/lib/server/api-errors.js';

test('toErrorMessage returns Error.message for Error instances', () => {
  expect(toErrorMessage(new Error('boom'))).toBe('boom');
});

test('toErrorMessage stringifies non-Error values', () => {
  expect(toErrorMessage('bad')).toBe('bad');
  expect(toErrorMessage(42)).toBe('42');
});
