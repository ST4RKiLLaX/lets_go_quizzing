import { redirect } from '@sveltejs/kit';
import { listQuizzes } from '$lib/server/storage/parser.js';
import { loadQuizRaw } from '$lib/server/storage/quiz-storage.js';
import { hasValidOperationalConfig } from '$lib/server/config.js';

export async function load() {
  const hasConfig = hasValidOperationalConfig();
  const hostPasswordRequired = hasConfig || !!process.env.HOST_PASSWORD;
  const needsSetup = !hasConfig;

  if (needsSetup && !hostPasswordRequired) {
    throw redirect(303, '/setup');
  }

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
    hostPasswordRequired,
    needsSetup: !hasConfig,
  };
}
