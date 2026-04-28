import { expect, test } from 'vitest';
import { dedupeAndCapCustomBlockedTerms } from '../src/lib/server/settings/custom-blocked-terms.js';
import { parseSettingsPutBody } from '../src/lib/server/settings/put-body.js';

test('dedupeAndCapCustomBlockedTerms normalizes and caps terms', () => {
  const terms = dedupeAndCapCustomBlockedTerms([
    ' Admin ',
    'admin',
    ' spaced   term ',
    'spaced term',
    '',
    'x'.repeat(70),
  ]);
  expect(terms).toHaveLength(3);
  expect(terms[0]).toBe('Admin');
  expect(terms[1]).toBe('spaced   term');
  expect(terms[2]).toHaveLength(50);
});

test('parseSettingsPutBody preserves omit semantics for wrong types', () => {
  const parsed = parseSettingsPutBody({
    username: ' admin ',
    roomIdLen: '8',
    prizeEmailSmtpSecure: 'yes',
    customBlockedTerms: 'not-array',
  });

  expect(parsed.newUsername).toBe('admin');
  expect(parsed.roomIdLen).toBe(8);
  expect(parsed.prizeEmailSmtpSecure).toBeUndefined();
  expect(parsed.customBlockedTermsRaw).toBeUndefined();
});
