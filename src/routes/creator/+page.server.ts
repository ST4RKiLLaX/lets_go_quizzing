import { listQuizItems } from '$lib/server/quiz-list.js';

export async function load({ parent }) {
  const { authenticated } = await parent();
  const quizzes = authenticated ? listQuizItems() : [];
  return {
    quizzes,
  };
}
