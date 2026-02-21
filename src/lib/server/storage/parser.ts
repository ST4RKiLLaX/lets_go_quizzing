import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve, relative } from 'path';
import { formatZodError } from '../../utils/format-zod-error.js';
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

function checkForUrlSpaces(content: string): void {
  if (/https?:\s+\/\//.test(content)) {
    throw new Error(
      'Remove spaces from the URL. Use https://example.com not "https: //example.com".'
    );
  }
}

function improveYamlParseError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('Implicit map keys need to be followed by map values') ||
    msg.includes('Implicit keys need to be on a single line')
  ) {
    return new Error(
      'Put a space after the colon (e.g. "answer: 2" not "answer:2", "text: Hello" not "text:Hello").'
    );
  }
  if (msg.includes('Nested mappings are not allowed in compact mappings')) {
    if (msg.includes('https:') || msg.includes('http:')) {
      return new Error(
        'Remove spaces from the URL. Use https://example.com not "https: //example.com".'
      );
    }
    return new Error(
      'YAML syntax error: avoid spaces inside key-value pairs. Quote values with special characters.'
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

export function parseQuizFile(filePath: string): Quiz {
  const content = readFileSync(filePath, 'utf-8');
  checkForUrlSpaces(content);
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (e) {
    throw improveYamlParseError(e);
  }
  try {
    return QuizSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) throw new Error(formatZodError(e));
    throw e;
  }
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
