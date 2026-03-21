import { listQuizzes } from '$lib/server/storage/parser.js';
import { loadQuizRaw } from '$lib/server/storage/quiz-storage.js';
import type { QuizListItem } from '$lib/types/quiz-list.js';

export function listQuizItems(): QuizListItem[] {
  return listQuizzes().map((filename) => {
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
}
