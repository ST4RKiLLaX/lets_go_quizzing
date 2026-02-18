import { listQuizzes } from '$lib/server/parser.js';

export async function load({ parent }) {
  const { authenticated } = await parent();
  return {
    quizzes: authenticated ? listQuizzes() : [],
  };
}
