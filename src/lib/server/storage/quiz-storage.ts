import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { stringify } from 'yaml';
import { loadQuiz, type Quiz } from './parser.js';

const QUIZZES_DIR = join(process.cwd(), 'data', 'quizzes');
const IMAGES_DIR = join(QUIZZES_DIR, 'images');

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
  if (!existsSync(QUIZZES_DIR)) {
    mkdirSync(QUIZZES_DIR, { recursive: true });
  }
  const path = join(QUIZZES_DIR, filename);
  const content = stringify(quiz, { lineWidth: 0 });
  writeFileSync(path, content, 'utf-8');
}

export function loadQuizRaw(filename: string): Quiz {
  return loadQuiz(filename);
}

export function readQuizYamlRaw(filename: string): string {
  if (!/^[a-z0-9_.-]+\.(yaml|yml)$/i.test(filename)) {
    throw new Error('Invalid filename');
  }
  return readFileSync(join(QUIZZES_DIR, filename), 'utf-8');
}

export function resolveUniqueQuizFilename(baseFilename: string): string {
  let filename = baseFilename;
  if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
    filename += '.yaml';
  }
  if (!/^[a-z0-9_.-]+\.(yaml|yml)$/i.test(filename)) {
    throw new Error('Invalid filename');
  }
  if (!existsSync(join(QUIZZES_DIR, filename))) return filename;

  const extMatch = /\.(yaml|yml)$/i.exec(filename);
  const ext = extMatch?.[0] ?? '.yaml';
  const stem = filename.slice(0, -ext.length);

  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem}_${i}${ext}`;
    if (!existsSync(join(QUIZZES_DIR, candidate))) return candidate;
  }
  throw new Error('Unable to find unique filename');
}

export function deleteQuizAndImages(filename: string): void {
  if (!/^[a-z0-9_.-]+\.(yaml|yml)$/i.test(filename)) {
    throw new Error('Invalid filename');
  }
  const quizPath = join(QUIZZES_DIR, filename);
  const slug = filename.replace(/\.(yaml|yml)$/i, '');
  const imagesPath = join(IMAGES_DIR, slug);
  rmSync(quizPath, { force: true });
  rmSync(imagesPath, { recursive: true, force: true });
}

export function generateFilenameFromTitle(title: string): string {
  return `${sanitizeFilename(title)}.yaml`;
}
