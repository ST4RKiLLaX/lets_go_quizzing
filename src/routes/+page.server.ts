import { redirect } from '@sveltejs/kit';
import { hasValidOperationalConfig } from '$lib/server/config.js';
import { listQuizItems } from '$lib/server/quiz-list.js';

export async function load() {
  const hasConfig = hasValidOperationalConfig();
  const hostPasswordRequired = hasConfig || !!process.env.HOST_PASSWORD;
  const needsSetup = !hasConfig;

  if (needsSetup && !hostPasswordRequired) {
    throw redirect(303, '/setup');
  }

  const quizzes = listQuizItems();

  return {
    quizzes,
    hostPasswordRequired,
    needsSetup: !hasConfig,
  };
}
