import { describe, expect, it } from 'vitest';
import {
  EMOJI_CATEGORIES,
  EMOJI_OPTIONS,
  normalizePlayerEmoji,
} from '../src/lib/player/emoji-options.js';

describe('EMOJI_CATEGORIES', () => {
  it('has exactly 7 categories', () => {
    expect(EMOJI_CATEGORIES).toHaveLength(7);
  });

  it('each category has exactly 55 emojis', () => {
    for (const category of EMOJI_CATEGORIES) {
      expect(category.emojis, `category "${category.id}"`).toHaveLength(55);
    }
  });

  it('every emoji is a non-empty string', () => {
    for (const category of EMOJI_CATEGORIES) {
      for (const emoji of category.emojis) {
        expect(typeof emoji, `category "${category.id}"`).toBe('string');
        expect(emoji.trim().length, `empty emoji in "${category.id}"`).toBeGreaterThan(0);
      }
    }
  });
});

describe('EMOJI_OPTIONS', () => {
  it('contains exactly 385 entries (7 × 55)', () => {
    expect(EMOJI_OPTIONS).toHaveLength(385);
  });

  it('has no raw duplicates', () => {
    const unique = new Set(EMOJI_OPTIONS);
    expect(unique.size).toBe(385);
  });

  it('preserves category order (flatMap of EMOJI_CATEGORIES)', () => {
    const flat = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    expect(EMOJI_OPTIONS).toEqual(flat);
  });

  it('includes legacy fixture emoji used in test stubs', () => {
    expect(EMOJI_OPTIONS).toContain('😀');
    expect(EMOJI_OPTIONS).toContain('🔥');
  });
});

describe('normalizePlayerEmoji', () => {
  it('returns the emoji when non-empty', () => {
    expect(normalizePlayerEmoji('😀')).toBe('😀');
  });

  it('falls back to 👤 for empty string', () => {
    expect(normalizePlayerEmoji('')).toBe('👤');
  });

  it('falls back to 👤 for undefined', () => {
    expect(normalizePlayerEmoji(undefined)).toBe('👤');
  });

  it('all 385 emojis are post-truncation unique (slice safety)', () => {
    const normalized = EMOJI_OPTIONS.map((e) => normalizePlayerEmoji(e));
    const unique = new Set(normalized);
    expect(
      unique.size,
      'Two or more curated emoji share the same normalized (slice-truncated) identity',
    ).toBe(385);
  });
});
