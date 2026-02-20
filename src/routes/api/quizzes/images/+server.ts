import { json } from '@sveltejs/kit';
import { writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';
import { isValidQuizFilename } from '$lib/server/storage/parser.js';

const IMAGES_DIR = join(process.cwd(), 'data', 'quizzes', 'images');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const QUESTION_ID_REGEX = /^[a-zA-Z0-9_.-]+$/;

export async function POST({ request }) {
  if (!requireHostPassword()) {
    return json({ error: 'Hosting disabled' }, { status: 503 });
  }
  if (!isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, { status: 400 });
  }

  const quizFilename = formData.get('quizFilename');
  const questionId = formData.get('questionId');
  const file = formData.get('file');

  if (typeof quizFilename !== 'string' || !isValidQuizFilename(quizFilename)) {
    return json({ error: 'Invalid quiz filename' }, { status: 400 });
  }
  if (typeof questionId !== 'string' || !questionId.trim() || !QUESTION_ID_REGEX.test(questionId)) {
    return json({ error: 'Invalid question ID' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return json({ error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: 'Invalid file type. Allowed: jpg, png, gif, webp' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return json({ error: 'File too large. Max 5MB' }, { status: 400 });
  }

  const ext = EXT_BY_MIME[file.type] ?? 'png';
  const slug = quizFilename.replace(/\.(yaml|yml)$/i, '');
  const dir = join(IMAGES_DIR, slug);
  const filename = `${questionId}.${ext}`;
  const filepath = join(dir, filename);

  try {
    await mkdir(dir, { recursive: true });
    const buffer = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(buffer));
    return json({ filename });
  } catch (e) {
    console.error('[images] Upload failed:', e);
    return json({ error: 'Upload failed' }, { status: 400 });
  }
}
