import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  containsCustomBlockedTerm,
  setCustomBlockTestOverride,
  resetCustomBlockCache,
} from '../src/lib/server/custom-block.js';

describe('custom block list', () => {
  beforeEach(() => {
    setCustomBlockTestOverride({ enabled: true, terms: ['67', 'skibidi'] });
    resetCustomBlockCache();
  });

  it('67! → blocked (punctuation does not break digit token)', () => {
    assert.strictEqual(containsCustomBlockedTerm('67!'), true);
  });

  it('hello, skibidi. → blocked (punctuation breaks tokens; skibidi matches)', () => {
    assert.strictEqual(containsCustomBlockedTerm('hello, skibidi.'), true);
  });

  it('skibbity → not blocked (different spelling; exact match only)', () => {
    assert.strictEqual(containsCustomBlockedTerm('skibbity'), false);
  });

  it('skibidi-toilet → blocked if skibidi is listed (tokenization splits on -)', () => {
    assert.strictEqual(containsCustomBlockedTerm('skibidi-toilet'), true);
  });

  it('classy → not blocked unless explicitly listed', () => {
    assert.strictEqual(containsCustomBlockedTerm('classy'), false);
  });

  it('SKIBIDI → blocked (normalized match)', () => {
    assert.strictEqual(containsCustomBlockedTerm('SKIBIDI'), true);
  });

  it('67 in middle of text → blocked', () => {
    assert.strictEqual(containsCustomBlockedTerm('hello 67 world'), true);
  });

  it('returns false when filter disabled', () => {
    setCustomBlockTestOverride({ enabled: false, terms: ['67', 'skibidi'] });
    resetCustomBlockCache();
    assert.strictEqual(containsCustomBlockedTerm('67!'), false);
  });

  it('returns false when terms empty', () => {
    setCustomBlockTestOverride({ enabled: true, terms: [] });
    resetCustomBlockCache();
    assert.strictEqual(containsCustomBlockedTerm('67!'), false);
  });
});
