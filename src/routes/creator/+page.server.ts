import { listQuizzes } from '$lib/server/storage/parser.js';
import { loadQuizRaw } from '$lib/server/storage/quiz-storage.js';

type CreatorQuizListItem = {
  filename: string;
  title: string;
};

export async function load({ parent }) {
  const { authenticated } = await parent();
  const quizzes: CreatorQuizListItem[] = authenticated
    ? listQuizzes().map((filename) => {
        try {
          const quiz = loadQuizRaw(filename);
          return { filename, title: quiz.meta.name };
        } catch {
          return {
            filename,
            title: filename.replace(/\.(yaml|yml)$/i, ''),
          };
        }
      })
    : [];
  return {
    quizzes,
  };
}
