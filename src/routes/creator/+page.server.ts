import { listQuizzes } from '$lib/server/storage/parser.js';

export async function load({ parent }) {
  const { authenticated } = await parent();
  return {
    quizzes: authenticated ? listQuizzes() : [],
  };
}
