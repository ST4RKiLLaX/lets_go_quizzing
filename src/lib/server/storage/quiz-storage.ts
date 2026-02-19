import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { stringify } from 'yaml';
import { loadQuiz, type Quiz } from './parser.js';

const QUIZZES_DIR = join(process.cwd(), 'data', 'quizzes');

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'quiz';
}

export function saveQuiz(quiz: Quiz, filename: string): void {
  if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
    filename += '.yaml';
  }
  if (!/^[a-z0-9_.-]+\.(yaml|yml)$/i.test(filename)) {
    throw new Error('Invalid filename');
  }
  const path = join(QUIZZES_DIR, filename);
  const content = stringify(quiz, { lineWidth: 0 });
  writeFileSync(path, content, 'utf-8');
}

export function loadQuizRaw(filename: string): Quiz {
  return loadQuiz(filename);
}

export function generateFilenameFromTitle(title: string): string {
  return `${sanitizeFilename(title)}.yaml`;
}
