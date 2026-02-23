import { listQuizzes } from '$lib/server/storage/parser.js';
import { loadQuizRaw } from '$lib/server/storage/quiz-storage.js';

export async function load() {
  const quizzes = listQuizzes().map((filename) => {
    try {
      const quiz = loadQuizRaw(filename);
      return { filename, title: quiz.meta.name };
    } catch {
      return {
        filename,
        title: filename.replace(/\.(yaml|yml)$/i, ''),
      };
    }
  });

  return {
    quizzes,
    hostPasswordRequired: !!process.env.HOST_PASSWORD,
  };
}
