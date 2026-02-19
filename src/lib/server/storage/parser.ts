import { parse as parseYaml } from 'yaml';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve, relative } from 'path';
import { z } from 'zod';

const QUIZ_FILENAME_REGEX = /^[a-z0-9_.-]+\.(yaml|yml)$/i;

export function isValidQuizFilename(filename: string): boolean {
  return QUIZ_FILENAME_REGEX.test(filename);
}

const ChoiceQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('choice'),
  text: z.string(),
  options: z.array(z.string()),
  answer: z.number().int().min(0),
});

const InputQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('input'),
  text: z.string(),
  answer: z.union([z.string(), z.array(z.string())]).transform((v) =>
    Array.isArray(v) ? v : [v]
  ),
});

const QuestionSchema = z.discriminatedUnion('type', [
  ChoiceQuestionSchema,
  InputQuestionSchema,
]);

const RoundSchema = z.object({
  name: z.string(),
  questions: z.array(QuestionSchema),
});

const QuizMetaSchema = z.object({
  name: z.string(),
  author: z.string().optional(),
  default_timer: z.number().int().min(0).optional(),
  fuzzy_threshold: z.number().min(0).max(1).optional(),
});

export const QuizSchema = z.object({
  meta: QuizMetaSchema,
  rounds: z.array(RoundSchema),
});

export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;
export type InputQuestion = z.infer<typeof InputQuestionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type QuizMeta = z.infer<typeof QuizMetaSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

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
