import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, relative } from 'path';
import { isValidQuizFilename } from '$lib/server/storage/parser.js';
import { QUIZ_IMAGE_MIME_BY_EXT, getQuizImagesRootDir } from '$lib/server/storage/quiz-images.js';
const IMAGE_FILENAME_REGEX = /^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+$/;

export async function GET({ params }) {
  const filename = params.filename;
  const image = params.image;

  if (!filename || !isValidQuizFilename(filename)) {
    return json({ error: 'Invalid filename' }, { status: 400 });
  }
  if (!image || !IMAGE_FILENAME_REGEX.test(image)) {
    return json({ error: 'Invalid image name' }, { status: 400 });
  }

  const slug = filename.replace(/\.(yaml|yml)$/i, '');
  const dir = join(getQuizImagesRootDir(), slug);
  const dirResolved = resolve(dir);
  const filepath = resolve(join(dirResolved, image));

  // Path traversal guard: ensure resolved path is under images dir (Windows-safe)
  const rel = relative(dirResolved, filepath);
  if (rel.startsWith('..') || rel.includes('..')) {
    return json({ error: 'Invalid path' }, { status: 400 });
  }

  if (!existsSync(filepath)) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const ext = image.split('.').pop()?.toLowerCase() ?? '';
  const contentType = QUIZ_IMAGE_MIME_BY_EXT[ext] ?? 'application/octet-stream';

  const buffer = await readFile(filepath);
  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
