import { json } from '@sveltejs/kit';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';
import { isValidQuizFilename } from '$lib/server/storage/parser.js';
import {
  QUIZ_IMAGE_ALLOWED_TYPES,
  QUIZ_IMAGE_MAX_SIZE,
  isValidQuestionId,
  writeQuizImageForQuestion,
} from '$lib/server/storage/quiz-images.js';

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
  if (typeof questionId !== 'string' || !isValidQuestionId(questionId)) {
    return json({ error: 'Invalid question ID' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return json({ error: 'No file provided' }, { status: 400 });
  }
  if (!QUIZ_IMAGE_ALLOWED_TYPES.includes(file.type as (typeof QUIZ_IMAGE_ALLOWED_TYPES)[number])) {
    return json({ error: 'Invalid file type. Allowed: jpg, png, gif, webp' }, { status: 400 });
  }
  if (file.size > QUIZ_IMAGE_MAX_SIZE) {
    return json({ error: 'File too large. Max 5MB' }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const filename = await writeQuizImageForQuestion({
      quizFilename,
      questionId,
      mimeType: file.type,
      buffer: Buffer.from(buffer),
    });
    return json({ filename });
  } catch (e) {
    console.error('[images] Upload failed:', e);
    return json({ error: 'Upload failed' }, { status: 400 });
  }
}
