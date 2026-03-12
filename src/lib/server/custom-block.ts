/**
 * Custom block list (classroom keyword filter).
 * Teacher-defined terms. Exact normalized token matching only.
 * v1: No phrases, no fuzzy matching, no regex.
 *
 * Storage: Config stores trimmed raw terms. This module compiles a cached
 * normalized Set for matching.
 */
import { getCustomKeywordFilterEnabled, getCustomBlockedTerms } from './config.js';

const ZERO_WIDTH = /\u200B|\u200C|\u200D|\uFEFF/g;
const TOKEN_REGEX = /[\p{L}\p{N}]+/gu;

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').replace(ZERO_WIDTH, '').trim();
}

let cachedNormalizedSet: Set<string> | null = null;

/** Test override. When set, used instead of config. Call resetCustomBlockCache after. */
let testOverride: { enabled: boolean; terms: string[] } | null = null;
export function setCustomBlockTestOverride(o: { enabled: boolean; terms: string[] } | null): void {
  testOverride = o;
  cachedNormalizedSet = null;
}

function buildNormalizedSet(): Set<string> {
  if (cachedNormalizedSet) return cachedNormalizedSet;
  const rawTerms = testOverride ? testOverride.terms : getCustomBlockedTerms();
  const set = new Set<string>();
  for (const term of rawTerms) {
    const t = term.trim();
    if (!t) continue;
    const n = normalize(t);
    if (n) set.add(n);
  }
  cachedNormalizedSet = set;
  return set;
}

export function resetCustomBlockCache(): void {
  cachedNormalizedSet = null;
}

/**
 * Returns true if text contains any blocked term as an exact normalized token.
 * Tokenization: [\p{L}\p{N}]+ (letters and digits; punctuation breaks tokens).
 */
export function containsCustomBlockedTerm(text: string): boolean {
  const enabled = testOverride ? testOverride.enabled : getCustomKeywordFilterEnabled();
  if (!enabled) return false;
  const blockedSet = buildNormalizedSet();
  if (blockedSet.size === 0) return false;

  const normalized = normalize(text);
  const tokens = normalized.match(TOKEN_REGEX);
  if (!tokens) return false;

  for (const token of tokens) {
    if (blockedSet.has(token)) return true;
  }
  return false;
}
