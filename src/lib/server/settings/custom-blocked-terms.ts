export const CUSTOM_BLOCK_MAX_TERMS = 100;
export const CUSTOM_BLOCK_MAX_TERM_LENGTH = 50;

function normalizeForDedupe(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
    .trim();
}

export function dedupeAndCapCustomBlockedTerms(raw: unknown[]): string[] {
  const trimmed = raw
    .map((t: unknown) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t: string) => t.length > 0);
  const normalizedSeen = new Set<string>();
  const deduped: string[] = [];
  for (const t of trimmed) {
    const capped = t.length > CUSTOM_BLOCK_MAX_TERM_LENGTH ? t.slice(0, CUSTOM_BLOCK_MAX_TERM_LENGTH) : t;
    const normalized = normalizeForDedupe(capped);
    if (normalized && !normalizedSeen.has(normalized)) {
      normalizedSeen.add(normalized);
      deduped.push(capped);
    }
  }
  return deduped.slice(0, CUSTOM_BLOCK_MAX_TERMS);
}
