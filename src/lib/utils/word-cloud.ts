/**
 * Canonical word-cloud token normalization.
 * Use for: aggregation, hide/show, filtering, counts.
 * Operates at token level (per-word), not whole phrase.
 */

/**
 * Normalize a single token for word-cloud matching.
 * Matches aggregation logic: trim, uppercase.
 */
export function normalizeWordCloudToken(token: string): string {
  return token.trim().toUpperCase();
}

/**
 * Extract normalized tokens from submitted text.
 * Same logic as aggregation - split on whitespace, normalize each.
 * Example: "very secure" → ["VERY", "SECURE"]
 */
export function getWordCloudTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  return text
    .trim()
    .split(/\s+/)
    .map((t) => normalizeWordCloudToken(t))
    .filter(Boolean);
}
