import { stringify, parse } from 'yaml';
import { z } from 'zod';
import { QuizSchema, type Quiz } from '$lib/schema/quiz.js';
import { formatZodError } from '$lib/utils/format-zod-error.js';

export function quizToYaml(quiz: Quiz): string {
  return stringify(quiz, { lineWidth: 0 });
}

/** Detect URLs with spaces that break YAML (e.g. "https: //example.com") */
function checkForUrlSpaces(yamlStr: string): void {
  const urlSpacePattern = /https?:\s+\/\//;
  const match = yamlStr.match(urlSpacePattern);
  if (match) {
    throw new Error(
      'Remove spaces from the URL. Use https://example.com not "https: //example.com".'
    );
  }
}

function improveYamlParseError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('Implicit map keys need to be followed by map values') ||
    msg.includes('Implicit keys need to be on a single line')
  ) {
    return new Error(
      'Put a space after the colon (e.g. "answer: 2" not "answer:2", "text: Hello" not "text:Hello").'
    );
  }
  if (msg.includes('Nested mappings are not allowed in compact mappings')) {
    if (msg.includes('https:') || msg.includes('http:')) {
      return new Error(
        'Remove spaces from the URL. Use https://example.com not "https: //example.com".'
      );
    }
    return new Error(
      'YAML syntax error: avoid spaces inside key-value pairs. Quote values with special characters.'
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

export function yamlToQuiz(yamlStr: string): Quiz {
  checkForUrlSpaces(yamlStr);
  let raw: unknown;
  try {
    raw = parse(yamlStr);
  } catch (e) {
    throw improveYamlParseError(e);
  }
  if (raw == null || typeof raw !== 'object') throw new Error('Invalid YAML');
  try {
    return QuizSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) throw new Error(formatZodError(e));
    throw e;
  }
}
