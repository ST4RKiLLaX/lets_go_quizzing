import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { QuizSchema, type Quiz } from './parser.js';
import { formatZodError } from '$lib/utils/format-zod-error.js';

const QUIZZES_DIR = join(process.cwd(), 'data', 'quizzes');
const IMAGES_ROOT = join(QUIZZES_DIR, 'images');
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

const ZIP_MAX_BYTES = 25 * 1024 * 1024;
const ZIP_MAX_ENTRIES = 500;

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function isSafeArchivePath(entryName: string): boolean {
  if (!entryName || entryName.includes('\\')) return false;
  if (entryName.startsWith('/') || entryName.startsWith('../') || entryName.includes('/../')) return false;
  return true;
}

function getExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

export function collectReferencedLocalImages(quiz: Quiz): string[] {
  const names = new Set<string>();
  for (const round of quiz.rounds) {
    for (const q of round.questions) {
      if (!q.image) continue;
      const img = q.image.trim();
      if (!img || isLikelyUrl(img)) continue;
      const base = basename(img);
      const ext = getExt(base);
      if (!ALLOWED_IMAGE_EXT.has(ext)) continue;
      names.add(base);
    }
  }
  return Array.from(names).sort();
}

export function buildQuizExportZip(params: {
  filename: string;
  quiz: Quiz;
  quizYaml: string;
}): Buffer {
  const { filename, quiz, quizYaml } = params;
  const slug = filename.replace(/\.(yaml|yml)$/i, '');
  const imagesDir = join(IMAGES_ROOT, slug);
  const referenced = collectReferencedLocalImages(quiz);
  const includedImages: string[] = [];
  const missingReferencedImages: string[] = [];

  const zip = new AdmZip();
  zip.addFile('quiz.yaml', Buffer.from(quizYaml, 'utf-8'));

  for (const imageName of referenced) {
    const path = join(imagesDir, imageName);
    if (!existsSync(path)) {
      missingReferencedImages.push(imageName);
      continue;
    }
    zip.addFile(`images/${imageName}`, readFileSync(path));
    includedImages.push(imageName);
  }

  const manifest = {
    originalFilename: filename,
    exportedAt: new Date().toISOString(),
    includedImages,
    missingReferencedImages,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  return zip.toBuffer();
}

export function parseQuizImportZip(zipBuffer: Buffer): {
  quiz: Quiz;
  quizYaml: string;
  yamlName: string;
  images: Array<{ name: string; content: Buffer }>;
} {
  if (zipBuffer.byteLength > ZIP_MAX_BYTES) {
    throw new Error('ZIP too large. Max 25MB.');
  }
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) throw new Error('ZIP is empty.');
  if (entries.length > ZIP_MAX_ENTRIES) throw new Error('ZIP has too many files.');

  const safeEntries = entries.filter((entry) => isSafeArchivePath(entry.entryName));
  if (safeEntries.length !== entries.length) {
    throw new Error('ZIP contains invalid paths.');
  }

  const yamlEntries = safeEntries.filter((entry) => {
    const name = entry.entryName;
    return !name.includes('/') && (name.endsWith('.yaml') || name.endsWith('.yml'));
  });
  if (yamlEntries.length !== 1) {
    throw new Error('ZIP must contain exactly one top-level .yaml or .yml file.');
  }

  const yamlEntry = yamlEntries[0];
  const quizYaml = yamlEntry.getData().toString('utf-8');

  let quiz: Quiz;
  try {
    quiz = QuizSchema.parse(parseYaml(quizYaml));
  } catch (e) {
    if (e instanceof z.ZodError) throw new Error(formatZodError(e));
    throw e instanceof Error ? e : new Error(String(e));
  }

  const images: Array<{ name: string; content: Buffer }> = [];
  for (const entry of safeEntries) {
    if (!entry.entryName.startsWith('images/')) continue;
    const parts = entry.entryName.split('/');
    const name = parts[parts.length - 1];
    if (!name) continue;
    const ext = getExt(name);
    if (!ALLOWED_IMAGE_EXT.has(ext)) continue;
    images.push({ name: basename(name), content: entry.getData() });
  }

  return { quiz, quizYaml, yamlName: basename(yamlEntry.entryName), images };
}

export function writeImportedQuizImages(filename: string, images: Array<{ name: string; content: Buffer }>): {
  importedImages: string[];
  skippedImages: string[];
} {
  const slug = filename.replace(/\.(yaml|yml)$/i, '');
  const dir = join(IMAGES_ROOT, slug);
  mkdirSync(dir, { recursive: true });

  const importedImages: string[] = [];
  const skippedImages: string[] = [];
  for (const image of images) {
    if (!image.name || image.name.includes('..')) {
      skippedImages.push(image.name || '(empty)');
      continue;
    }
    const ext = getExt(image.name);
    if (!ALLOWED_IMAGE_EXT.has(ext)) {
      skippedImages.push(image.name);
      continue;
    }
    writeFileSync(join(dir, image.name), image.content);
    importedImages.push(image.name);
  }
  return { importedImages, skippedImages };
}
