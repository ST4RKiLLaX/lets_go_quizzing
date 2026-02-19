import { json } from '@sveltejs/kit';
import { listQuizzes } from '$lib/server/storage/parser.js';
import { saveQuiz, generateFilenameFromTitle } from '$lib/server/storage/quiz-storage.js';
import { QuizSchema, type Quiz } from '$lib/server/storage/parser.js';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';

export async function GET() {
  const quizzes = listQuizzes();
  return json(quizzes);
}

export async function POST({ request }) {
  if (!requireHostPassword()) {
    return json({ error: 'Hosting disabled' }, { status: 503 });
  }
  if (!isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const quiz = QuizSchema.parse(body.quiz);
    const filename = body.filename ?? generateFilenameFromTitle(quiz.meta.name);
    saveQuiz(quiz, filename);
    return json({ ok: true, filename });
  } catch (e) {
    return json({ error: String(e) }, { status: 400 });
  }
}
