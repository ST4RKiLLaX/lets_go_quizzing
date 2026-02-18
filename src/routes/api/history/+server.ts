import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { json } from '@sveltejs/kit';

export async function GET() {
  const dir = join(process.cwd(), 'data', 'history');
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 50);
    const games = files.map((f) => {
      const content = readFileSync(join(dir, f), 'utf-8');
      return { filename: f, ...JSON.parse(content) };
    });
    return json(games);
  } catch {
    return json([]);
  }
}
