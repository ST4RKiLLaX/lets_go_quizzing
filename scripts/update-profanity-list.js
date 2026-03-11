#!/usr/bin/env node
/**
 * Fetches raw en.json from dsojevic/profanity-list and writes to src/lib/server/data/profanity-en.json.
 * Run manually; commit the output.
 *
 * This script does NOT parse or preprocess. The profanity module parses at init.
 * The dsojevic format includes allow_partial and exceptions; we intentionally disable
 * partial matching entirely in v1. Do not turn it back on without full exception support.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'lib', 'server', 'data', 'profanity-en.json');
const SOURCE_URL = 'https://raw.githubusercontent.com/dsojevic/profanity-list/main/en.json';

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  const json = await res.json();
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(json, null, 2), 'utf8');
  console.log(`Wrote ${OUTPUT_PATH} (${json.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
