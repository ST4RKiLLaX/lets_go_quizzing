import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState } from '../game/state-machine.js';

const DATA_DIR = 'data';

export function saveHistory(state: GameState): void {
  try {
    const dir = join(process.cwd(), DATA_DIR, 'history');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date}_game_${state.roomId}.json`;
    const path = join(dir, filename);
    const data = {
      roomId: state.roomId,
      quizName: state.quiz.meta.name,
      startedAt: state.startedAt,
      endedAt: Date.now(),
      players: Array.from(state.players.values()).map((p) => ({
        name: p.name,
        emoji: p.emoji,
        score: p.score,
      })),
    };
    writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}
