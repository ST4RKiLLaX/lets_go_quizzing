import { test, expect } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { resolveUniqueQuizFilename, deleteQuizAndImages } from '../src/lib/server/storage/quiz-storage.js';
import {
  buildQuizExportZip,
  parseQuizImportZip,
  collectReferencedLocalImages,
  isSafeArchivePath,
} from '../src/lib/server/storage/quiz-archive.js';
import type { Quiz } from '../src/lib/server/storage/parser.js';

const quizzesDir = join(process.cwd(), 'data', 'quizzes');
const imagesRoot = join(quizzesDir, 'images');

function uniqueStem(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test('resolveUniqueQuizFilename appends numeric suffix on collisions', () => {
  mkdirSync(quizzesDir, { recursive: true });
  const stem = uniqueStem('collision_test');
  const first = `${stem}.yaml`;
  const second = `${stem}_2.yaml`;
  writeFileSync(join(quizzesDir, first), 'meta:\n  name: A\nrounds: []\n', 'utf-8');
  try {
    expect(resolveUniqueQuizFilename(first)).toBe(second);
  } finally {
    rmSync(join(quizzesDir, first), { force: true });
  }
});

test('deleteQuizAndImages removes yaml and related image folder', () => {
  const stem = uniqueStem('delete_test');
  const filename = `${stem}.yaml`;
  const quizPath = join(quizzesDir, filename);
  const imageDir = join(imagesRoot, stem);
  mkdirSync(imageDir, { recursive: true });
  writeFileSync(quizPath, 'meta:\n  name: A\nrounds: []\n', 'utf-8');
  writeFileSync(join(imageDir, 'pic.png'), 'x', 'utf-8');

  deleteQuizAndImages(filename);

  expect(existsSync(quizPath)).toBe(false);
  expect(existsSync(imageDir)).toBe(false);
});

test('parseQuizImportZip validates and parses quiz + images', () => {
  const zip = new AdmZip();
  zip.addFile(
    'sample.yaml',
    Buffer.from(
      [
        'meta:',
        '  name: "Zip Quiz"',
        'rounds:',
        '  - name: Round 1',
        '    questions:',
        '      - id: q1',
        '        type: choice',
        '        text: Q?',
        '        image: pic.png',
        '        options:',
        '          - A',
        '          - B',
        '        answer: 0',
      ].join('\n'),
      'utf-8'
    )
  );
  zip.addFile('images/pic.png', Buffer.from([1, 2, 3]));

  const parsed = parseQuizImportZip(zip.toBuffer());
  expect(parsed.yamlName).toBe('sample.yaml');
  expect(parsed.quiz.meta.name).toBe('Zip Quiz');
  expect(parsed.images.map((i) => i.name)).toEqual(['pic.png']);
});

test('isSafeArchivePath rejects unsafe archive paths', () => {
  expect(isSafeArchivePath('images/pic.png')).toBe(true);
  expect(isSafeArchivePath('../escape.png')).toBe(false);
  expect(isSafeArchivePath('/abs/path.png')).toBe(false);
  expect(isSafeArchivePath('images\\win.png')).toBe(false);
});

test('buildQuizExportZip includes referenced existing images only', () => {
  const stem = uniqueStem('export_test');
  const filename = `${stem}.yaml`;
  const imageDir = join(imagesRoot, stem);
  mkdirSync(imageDir, { recursive: true });
  writeFileSync(join(imageDir, 'present.png'), Buffer.from([7, 8, 9]));

  const quiz: Quiz = {
    meta: { name: 'Export Quiz' },
    rounds: [
      {
        name: 'Round 1',
        questions: [
          {
            id: 'q1',
            type: 'choice',
            text: 'Q1',
            image: 'present.png',
            options: ['A', 'B'],
            answer: 0,
          },
          {
            id: 'q2',
            type: 'choice',
            text: 'Q2',
            image: 'missing.png',
            options: ['A', 'B'],
            answer: 1,
          },
          {
            id: 'q3',
            type: 'choice',
            text: 'Q3',
            image: 'https://example.com/remote.png',
            options: ['A', 'B'],
            answer: 1,
          },
        ],
      },
    ],
  };

  try {
    const zipBuffer = buildQuizExportZip({
      filename,
      quiz,
      quizYaml: 'meta:\n  name: Export Quiz\nrounds: []\n',
    });
    const zip = new AdmZip(zipBuffer);
    const names = zip
      .getEntries()
      .map((e) => e.entryName)
      .sort();
    expect(names).toEqual(['images/present.png', 'manifest.json', 'quiz.yaml']);
    const manifestRaw = zip.getEntry('manifest.json')?.getData().toString('utf-8') ?? '';
    expect(manifestRaw).toMatch(/"includedImages": \[\s*"present\.png"\s*\]/);
    expect(manifestRaw).toMatch(/"missingReferencedImages": \[\s*"missing\.png"\s*\]/);
  } finally {
    rmSync(join(imagesRoot, stem), { recursive: true, force: true });
  }
});

test('collectReferencedLocalImages skips URLs and invalid extensions', () => {
  const quiz: Quiz = {
    meta: { name: 'Images' },
    rounds: [
      {
        name: 'Round',
        questions: [
          {
            id: '1',
            type: 'choice',
            text: 'A',
            image: 'pic.png',
            options: ['x', 'y'],
            answer: 0,
          },
          {
            id: '2',
            type: 'input',
            text: 'B',
            image: 'https://example.com/a.png',
            answer: ['x'],
          },
          {
            id: '3',
            type: 'choice',
            text: 'C',
            image: 'doc.pdf',
            options: ['x', 'y'],
            answer: 1,
          },
        ],
      },
    ],
  };
  expect(collectReferencedLocalImages(quiz)).toEqual(['pic.png']);
});
