import { stringify, parse } from 'yaml';
import { QuizSchema, type Quiz } from '$lib/schema/quiz.js';

export function quizToYaml(quiz: Quiz): string {
  return stringify(quiz, { lineWidth: 0 });
}

export function yamlToQuiz(yamlStr: string): Quiz {
  const raw = parse(yamlStr);
  if (raw == null || typeof raw !== 'object') throw new Error('Invalid YAML');
  return QuizSchema.parse(raw);
}
