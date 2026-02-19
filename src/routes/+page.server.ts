import { listQuizzes } from '$lib/server/storage/parser.js';

export async function load() {
  return {
    quizzes: listQuizzes(),
    hostPasswordRequired: !!process.env.HOST_PASSWORD,
  };
}
