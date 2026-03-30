import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isValidQuizFilename } from './parser.js';

export const QUIZ_IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
export const QUIZ_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const QUIZ_IMAGE_EXT_BY_MIME: Record<(typeof QUIZ_IMAGE_ALLOWED_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
export const QUIZ_IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const QUIZ_QUESTION_ID_REGEX = /^[a-zA-Z0-9_.-]+$/;

export function getQuizImagesRootDir(): string {
  return join(process.cwd(), 'data', 'quizzes', 'images');
}

export function isValidQuestionId(questionId: string): boolean {
  return !!questionId.trim() && QUIZ_QUESTION_ID_REGEX.test(questionId);
}

export function normalizeQuizImageMime(contentType: string | null | undefined): string | undefined {
  if (!contentType) return undefined;
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (!normalized) return undefined;
  return QUIZ_IMAGE_ALLOWED_TYPES.includes(normalized as (typeof QUIZ_IMAGE_ALLOWED_TYPES)[number])
    ? normalized
    : undefined;
}

export function getQuizImageDir(quizFilename: string): string {
  if (!isValidQuizFilename(quizFilename)) {
    throw new Error('Invalid quiz filename');
  }
  const slug = quizFilename.replace(/\.(yaml|yml)$/i, '');
  return join(getQuizImagesRootDir(), slug);
}

export function getQuizImageFilename(questionId: string, mimeType: string): string {
  if (!isValidQuestionId(questionId)) {
    throw new Error('Invalid question ID');
  }
  const normalizedMime = normalizeQuizImageMime(mimeType);
  if (!normalizedMime) {
    throw new Error('Unsupported image type');
  }
  const ext = QUIZ_IMAGE_EXT_BY_MIME[normalizedMime as keyof typeof QUIZ_IMAGE_EXT_BY_MIME];
  return `${questionId}.${ext}`;
}

export async function writeQuizImageForQuestion(params: {
  quizFilename: string;
  questionId: string;
  mimeType: string;
  buffer: Uint8Array;
}): Promise<string> {
  const dir = getQuizImageDir(params.quizFilename);
  const filename = getQuizImageFilename(params.questionId, params.mimeType);
  const filepath = join(dir, filename);
  await mkdir(dir, { recursive: true });
  await writeFile(filepath, params.buffer);
  return filename;
}
