import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { deleteQuizAndImages, loadQuizRaw, saveQuiz } from '$lib/server/storage/quiz-storage.js';
import { QuizSchema, isValidQuizFilename } from '$lib/server/storage/parser.js';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';
import { formatZodError } from '$lib/utils/format-zod-error.js';

export async function GET({ params }) {
  const filename = params.filename;
  if (!filename || !isValidQuizFilename(filename)) {
    return json({ error: 'Invalid filename' }, { status: 400 });
  }
  try {
    const quiz = loadQuizRaw(filename);
    return json(quiz);
  } catch (e) {
    return json({ error: String(e) }, { status: 404 });
  }
}

export async function PUT({ params, request }) {
  if (!requireHostPassword()) {
    return json({ error: 'Hosting disabled' }, { status: 503 });
  }
  if (!isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const filename = params.filename;
  if (!filename || !isValidQuizFilename(filename)) {
    return json({ error: 'Invalid filename' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const quiz = QuizSchema.parse(body);
    saveQuiz(quiz, filename);
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof z.ZodError ? formatZodError(e) : String(e);
    return json({ error: msg }, { status: 400 });
  }
}

export async function DELETE({ params, request }) {
  if (!requireHostPassword()) {
    return json({ error: 'Hosting disabled' }, { status: 503 });
  }
  if (!isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const filename = params.filename;
  if (!filename || !isValidQuizFilename(filename)) {
    return json({ error: 'Invalid filename' }, { status: 400 });
  }
  try {
    deleteQuizAndImages(filename);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, { status: 400 });
  }
}
