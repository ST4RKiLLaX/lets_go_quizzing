/**
 * Simple seeded PRNG (mulberry32) for deterministic shuffle.
 */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0; // 32-bit
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a number for use as seed.
 */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Shuffle an array deterministically using a seed.
 * Same seed + same array = same result (for consistent display across clients).
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  const random = seededRandom(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Get shuffled option indices for a reorder question.
 * Uses question id as seed so all clients see the same order.
 */
export function getShuffledReorderIndices(questionId: string, optionCount: number): number[] {
  const indices = Array.from({ length: optionCount }, (_, i) => i);
  return seededShuffle(indices, hashString(questionId));
}
