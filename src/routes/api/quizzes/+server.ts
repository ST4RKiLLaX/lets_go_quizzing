import { json } from '@sveltejs/kit';
import { listQuizzes } from '$lib/server/parser.js';
import { saveQuiz, generateFilenameFromTitle } from '$lib/server/quiz-storage.js';
import type { Quiz } from '$lib/server/parser.js';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';

export async function GET() {
  const quizzes = listQuizzes();
  return json(quizzes);
}

export async function POST({ request }) {
  if (requireHostPassword() && !isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const quiz: Quiz = body.quiz;
    const filename = body.filename ?? generateFilenameFromTitle(quiz.meta.name);
    saveQuiz(quiz, filename);
    return json({ ok: true, filename });
  } catch (e) {
    return json({ error: String(e) }, { status: 400 });
  }
}
