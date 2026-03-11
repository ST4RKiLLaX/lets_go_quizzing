/**
 * Profanity filter module. Uses dsojevic/profanity-list (MIT).
 * Pre-compiles at first use; no per-request regex rebuild.
 *
 * PARTIAL MATCHING: The dsojevic format includes allow_partial and exceptions; its README
 * says implementations default partial matching to true. This module INTENTIONALLY DISABLES
 * partial matching entirely in v1. Do not turn it back on without full exception support.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(ZERO_WIDTH, '')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchToRegex(match: string): { type: 'word' | 'phrase' | 'pattern'; regex: RegExp } | null {
  const trimmed = match.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.includes('*')) {
    // dsojevic * = previous char can repeat (lo*ng → lo+ng)
    let pattern = '';
    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (c === '*') {
        if (pattern.length > 0) {
          const last = pattern[pattern.length - 1];
          if (last !== '+') pattern = pattern.slice(0, -1) + escapeRegex(last) + '+';
        } else pattern += '.+';
      } else pattern += escapeRegex(c);
    }
    return { type: 'pattern', regex: new RegExp(`\\b${pattern}\\b`, 'i') };
  }

  if (trimmed.includes(' ')) {
    const parts = trimmed.split(/\s+/).map(escapeRegex);
    const pattern = parts.join('\\s+');
    return { type: 'phrase', regex: new RegExp(`\\b${pattern}\\b`, 'i') };
  }

  const escaped = escapeRegex(trimmed);
  return { type: 'word', regex: new RegExp(`\\b${escaped}\\b`, 'i') };
}

interface CompiledList {
  singleWordMatchers: RegExp[];
  phraseMatchers: RegExp[];
  patternMatchers: RegExp[];
  allowlist: Set<string>;
  /** Exact single-word banned terms only (no space, no *). Used for segmented profanity. Base normalization. */
  bannedSingleWords: Set<string>;
}

let cached: CompiledList | null = null;
let aliasMatchersCached: RegExp[] | null = null;

function getDataPath(): string {
  return join(process.cwd(), 'src', 'lib', 'server', 'data', 'profanity-en.json');
}

function getAliasesPath(): string {
  return join(process.cwd(), 'src', 'lib', 'server', 'data', 'profanity-aliases-en.json');
}

function loadAndCompile(): CompiledList {
  if (cached) return cached;

  const path = getDataPath();
  if (!existsSync(path)) {
    cached = {
      singleWordMatchers: [],
      phraseMatchers: [],
      patternMatchers: [],
      allowlist: new Set(),
      bannedSingleWords: new Set(),
    };
    return cached;
  }

  const raw = JSON.parse(readFileSync(path, 'utf8')) as Array<{ match?: string }>;
  const singleWordMatchers: RegExp[] = [];
  const phraseMatchers: RegExp[] = [];
  const patternMatchers: RegExp[] = [];
  const seenPatterns = new Set<string>();
  const bannedSingleWords = new Set<string>();

  for (const entry of raw) {
    const matchStr = entry.match;
    if (!matchStr || typeof matchStr !== 'string') continue;

    for (const variant of matchStr.split('|')) {
      const v = variant.trim().toLowerCase();
      if (!v) continue;

      // Segmented profanity: exact single-word banned terms only. No phrases, wildcard patterns, or partial terms.
      if (!v.includes(' ')) {
        if (!v.includes('*')) {
          const n = normalize(v);
          if (n) bannedSingleWords.add(n);
        } else {
          // Derive minimal form from pattern (e.g. bi*tch → bitch) for segmented profanity.
          const minimal = v.replace(/\*/g, '');
          const n = normalize(minimal);
          if (n && n.length >= 3) bannedSingleWords.add(n);
        }
      }

      const result = matchToRegex(v);
      if (!result) continue;

      const key = result.regex.source;
      if (seenPatterns.has(key)) continue;
      seenPatterns.add(key);

      if (result.type === 'word') {
        singleWordMatchers.push(result.regex);
      } else if (result.type === 'phrase') {
        phraseMatchers.push(result.regex);
      } else {
        patternMatchers.push(result.regex);
      }
    }
  }

  const allowlist = new Set<string>();
  const cfg = loadConfig();
  const list = cfg?.profanityAllowlist;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === 'string') {
        const n = normalize(item);
        if (n) allowlist.add(n);
      }
    }
  }

  cached = { singleWordMatchers, phraseMatchers, patternMatchers, allowlist, bannedSingleWords };
  return cached;
}

function loadAliasMatchers(): RegExp[] {
  if (aliasMatchersCached) return aliasMatchersCached;
  const path = getAliasesPath();
  if (!existsSync(path)) {
    aliasMatchersCached = [];
    return aliasMatchersCached;
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Array<{ match?: string }>;
  const matchers: RegExp[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const matchStr = entry.match;
    if (!matchStr || typeof matchStr !== 'string') continue;
    for (const variant of matchStr.split('|')) {
      const v = variant.trim().toLowerCase();
      if (!v) continue;
      const result = matchToRegex(v);
      if (!result) continue;
      const key = result.regex.source;
      if (seen.has(key)) continue;
      seen.add(key);
      matchers.push(result.regex);
    }
  }
  aliasMatchersCached = matchers;
  return aliasMatchersCached;
}

function isExactBannedSingleWord(word: string, list: CompiledList): boolean {
  // Base normalization only (NFKC, lowercase, etc.). No repeat-collapse or substitutions.
  const n = normalize(word);
  return list.bannedSingleWords.has(n) && !list.allowlist.has(n);
}

/**
 * Segmented profanity uses bannedSingleWords only. No phrases, wildcard patterns, or partial terms.
 * Full-token segmentation into 2–4 banned single words; each segment >= 3 chars.
 */
function canSegmentToken(
  token: string,
  list: CompiledList,
  maxParts: number,
  start = 0,
  depth = 0,
  memo = new Map<string, boolean>()
): boolean {
  const key = `${start}:${depth}`;
  if (memo.has(key)) return memo.get(key)!;
  const remaining = token.length - start;

  if (start === token.length) {
    const ok = depth >= 2 && depth <= maxParts;
    memo.set(key, ok);
    return ok;
  }
  if (depth >= maxParts) {
    memo.set(key, false);
    return false;
  }
  if (remaining < 3) {
    memo.set(key, false);
    return false;
  }
  if (depth < 2 && remaining < 3 * (2 - depth)) {
    memo.set(key, false);
    return false;
  }

  for (let len = 3; len <= remaining; len++) {
    const seg = token.slice(start, start + len);
    if (isExactBannedSingleWord(seg, list)) {
      if (canSegmentToken(token, list, maxParts, start + len, depth + 1, memo)) {
        memo.set(key, true);
        return true;
      }
    }
  }
  memo.set(key, false);
  return false;
}

function hasSegmentedProfanity(text: string, list: CompiledList, maxParts = 4): boolean {
  // Compound splitting is intentionally letter-only; hyphens, digits, and punctuation break tokens by design.
  const tokens = text.match(/\p{L}+/gu);
  if (!tokens) return false;

  for (const token of tokens) {
    if (token.length < 6) continue;
    if (token.length >= 64) continue; // Skip 64+ chars (defensive CPU guard)

    if (canSegmentToken(token, list, maxParts)) return true;
  }
  return false;
}

function collapseRepeatedLetters(text: string): string {
  return text.replace(/([a-zA-Z])\1+/g, '$1');
}

function applyAggressiveSubstitutions(text: string): string {
  return text
    .replace(/ph/gi, 'f')
    .replace(/ck/gi, 'k');
}

/**
 * Check if text contains profanity. Uses NFKC normalization, word-boundary matching.
 * No partial matching in v1.
 */
export function containsProfanity(text: string): boolean {
  const list = loadAndCompile();
  const normalized = normalize(text);
  if (!normalized) return false;

  if (list.allowlist.has(normalized)) return false;

  for (const re of list.singleWordMatchers) {
    if (re.test(normalized)) return true;
  }

  for (const re of list.phraseMatchers) {
    if (re.test(normalized)) return true;
  }

  for (const re of list.patternMatchers) {
    if (re.test(normalized)) return true;
  }

  return false;
}

/**
 * Aggressive matcher for names and public text. Applies repeat-letter collapse,
 * ph→f and ck→k substitution, then runs conservative pass. Also checks alias list.
 * Use only for names, open_ended, word_cloud, and strict input—not for scoring.
 */
export function containsProfanityAggressive(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;

  if (containsProfanity(normalized)) return true;

  const collapsed = collapseRepeatedLetters(normalized);
  const substituted = applyAggressiveSubstitutions(collapsed);
  if (substituted !== normalized && containsProfanity(substituted)) return true;

  for (const re of loadAliasMatchers()) {
    if (re.test(normalized)) return true;
  }

  const list = loadAndCompile();
  // Segmentation runs only after conservative and alias checks miss (most expensive step).
  // Run on normalized first; if it misses and substituted differs, run on substituted too
  // (catches obfuscated forms; normalized catches compounds where second word has repeated letters).
  if (hasSegmentedProfanity(normalized, list)) return true;
  if (substituted !== normalized && hasSegmentedProfanity(substituted, list)) return true;

  // Spaced evasion: "f u u u c k k y" → strip spaces → "fuuuckky" → collapse → "fucky" → alias match.
  const spaceless = normalized.replace(/\s+/g, '');
  if (spaceless !== normalized) {
    const collapsedSpaceless = collapseRepeatedLetters(spaceless);
    const substitutedSpaceless = applyAggressiveSubstitutions(collapsedSpaceless);
    if (containsProfanity(collapsedSpaceless)) return true;
    if (substitutedSpaceless !== collapsedSpaceless && containsProfanity(substitutedSpaceless)) return true;
    for (const re of loadAliasMatchers()) {
      if (re.test(collapsedSpaceless) || re.test(substitutedSpaceless)) return true;
    }
    if (hasSegmentedProfanity(collapsedSpaceless, list)) return true;
    if (substitutedSpaceless !== collapsedSpaceless && hasSegmentedProfanity(substitutedSpaceless, list)) return true;
  }

  return false;
}

/**
 * Reset cached list (e.g. for tests or config change).
 */
export function resetProfanityCache(): void {
  cached = null;
  aliasMatchersCached = null;
}

