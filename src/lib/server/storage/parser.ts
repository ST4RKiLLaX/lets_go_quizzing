import { parse as parseYaml } from 'yaml';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve, relative } from 'path';
import {
  QuizSchema,
  type Quiz,
  type ChoiceQuestion,
  type InputQuestion,
  type Question,
  type Round,
  type QuizMeta,
} from '../../schema/quiz.js';

const QUIZ_FILENAME_REGEX = /^[a-z0-9_.-]+\.(yaml|yml)$/i;

export function isValidQuizFilename(filename: string): boolean {
  return QUIZ_FILENAME_REGEX.test(filename);
}

export {
  QuizSchema,
  type Quiz,
  type ChoiceQuestion,
  type InputQuestion,
  type Question,
  type Round,
  type QuizMeta,
};

export function parseQuizFile(filePath: string): Quiz {
  const content = readFileSync(filePath, 'utf-8');
  const raw = parseYaml(content);
  return QuizSchema.parse(raw);
}

export function loadQuiz(quizFilename: string, dataDir = 'data'): Quiz {
  if (!isValidQuizFilename(quizFilename)) {
    throw new Error('Invalid filename');
  }
  const baseDir = resolve(process.cwd(), dataDir, 'quizzes');
  const filePath = resolve(baseDir, quizFilename);
  const rel = relative(baseDir, filePath);
  if (rel.startsWith('..') || rel.includes('..')) {
    throw new Error('Invalid filename');
  }
  return parseQuizFile(filePath);
}

export function listQuizzes(dataDir = 'data'): string[] {
  const dir = join(process.cwd(), dataDir, 'quizzes');
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .sort();
  } catch {
    return [];
  }
}
