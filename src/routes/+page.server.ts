import { listQuizzes } from '$lib/server/parser.js';

export async function load() {
  return {
    quizzes: listQuizzes(),
  };
}
