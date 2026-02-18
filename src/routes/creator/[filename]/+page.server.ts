import { loadQuizRaw } from '$lib/server/quiz-storage.js';

export async function load({ params }) {
  const filename = params.filename;
  if (!filename) {
    return { quiz: null };
  }
  try {
    const quiz = loadQuizRaw(filename);
    return { quiz };
  } catch {
    return { quiz: null };
  }
}
