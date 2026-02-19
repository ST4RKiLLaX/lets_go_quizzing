import { json } from '@sveltejs/kit';
import { loadQuizRaw, saveQuiz } from '$lib/server/storage/quiz-storage.js';
import type { Quiz } from '$lib/server/storage/parser.js';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';

export async function GET({ params }) {
  const filename = params.filename;
  if (!filename) {
    return json({ error: 'Filename required' }, { status: 400 });
  }
  try {
    const quiz = loadQuizRaw(filename);
    return json(quiz);
  } catch (e) {
    return json({ error: String(e) }, { status: 404 });
  }
}

export async function PUT({ params, request }) {
  if (requireHostPassword() && !isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const filename = params.filename;
  if (!filename) {
    return json({ error: 'Filename required' }, { status: 400 });
  }
  try {
    const quiz: Quiz = await request.json();
    saveQuiz(quiz, filename);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, { status: 400 });
  }
}
