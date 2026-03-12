import { describe, it, beforeEach, expect } from 'vitest';
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
    expect(containsCustomBlockedTerm('67!')).toBe(true);
  });

  it('hello, skibidi. → blocked (punctuation breaks tokens; skibidi matches)', () => {
    expect(containsCustomBlockedTerm('hello, skibidi.')).toBe(true);
  });

  it('skibbity → not blocked (different spelling; exact match only)', () => {
    expect(containsCustomBlockedTerm('skibbity')).toBe(false);
  });

  it('skibidi-toilet → blocked if skibidi is listed (tokenization splits on -)', () => {
    expect(containsCustomBlockedTerm('skibidi-toilet')).toBe(true);
  });

  it('classy → not blocked unless explicitly listed', () => {
    expect(containsCustomBlockedTerm('classy')).toBe(false);
  });

  it('SKIBIDI → blocked (normalized match)', () => {
    expect(containsCustomBlockedTerm('SKIBIDI')).toBe(true);
  });

  it('67 in middle of text → blocked', () => {
    expect(containsCustomBlockedTerm('hello 67 world')).toBe(true);
  });

  it('returns false when filter disabled', () => {
    setCustomBlockTestOverride({ enabled: false, terms: ['67', 'skibidi'] });
    resetCustomBlockCache();
    expect(containsCustomBlockedTerm('67!')).toBe(false);
  });

  it('returns false when terms empty', () => {
    setCustomBlockTestOverride({ enabled: true, terms: [] });
    resetCustomBlockCache();
    expect(containsCustomBlockedTerm('67!')).toBe(false);
  });
});
