import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import { insertCompletionText, pickedCompletion } from '@codemirror/autocomplete';
import { jsonPointerForPosition } from 'codemirror-json-schema';
import YAML from 'yaml';

const MODES_YAML = 'yaml';

/**
 * Navigate from root data to the object at the given JSON pointer.
 * e.g. getAtPath(data, '/rounds/0/questions/1') -> data.rounds[0].questions[1]
 */
function getAtPath(data: unknown, pointer: string): unknown {
  if (!data || !pointer || pointer === '/') return data;
  const segments = pointer.replace(/^\/+/, '').split('/');
  let obj: unknown = data;
  for (const seg of segments) {
    if (obj == null) return undefined;
    const decoded = seg.replace(/~1/g, '/').replace(/~0/g, '~');
    const num = parseInt(decoded, 10);
    obj = Number.isNaN(num) ? (obj as Record<string, unknown>)[decoded] : (obj as unknown[])[num];
  }
  return obj;
}

/**
 * Custom completion source: when typing the value for `answer:` in a choice question,
 * show options like "0 - What?", "1 - No", "2 - Yes" based on the options array above.
 */
export function choiceAnswerCompletion(ctx: CompletionContext): CompletionResult | null {
  const pointer = jsonPointerForPosition(ctx.state, ctx.pos, -1, MODES_YAML);
  if (!pointer.endsWith('/answer')) return null;

  let data: unknown;
  try {
    data = YAML.parse(ctx.state.doc.toString());
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const questionPath = pointer.slice(0, -'/answer'.length);
  const question = getAtPath(data, questionPath) as { type?: string; options?: string[] } | undefined;
  if (question?.type !== 'choice' || !Array.isArray(question.options) || question.options.length === 0) {
    return null;
  }

  const options = question.options;
  const match = ctx.matchBefore(/\d*/);
  const from = match ? match.from : ctx.pos;
  const to = ctx.pos;

  const completions: Completion[] = options.map((opt, i) => ({
    label: String(i),
    detail: opt,
    type: 'constant',
    apply: String(i),
  }));

  return {
    from,
    to,
    options: completions,
    filter: false,
  };
}

/**
 * Wraps the schema completion to replace "options" insert with YAML list format:
 * options:
 *   -
 * instead of options:[]
 */
type SchemaCompletionLike = (
  ctx: CompletionContext
) => CompletionResult | Completion[] | Promise<CompletionResult | Completion[] | null> | null;

export function wrapSchemaCompletionWithOptionsList(schemaCompletion: SchemaCompletionLike): CompletionSource {
  const completion = schemaCompletion;
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const maybeResult = await Promise.resolve(completion(ctx));
    if (!maybeResult || Array.isArray(maybeResult) || !maybeResult.options?.length) {
      return maybeResult && !Array.isArray(maybeResult) ? maybeResult : null;
    }
    const result = maybeResult;

    const options = result.options.map((opt: Completion): Completion => {
      if (opt.label !== 'options') return opt;

      return {
        ...opt,
        detail: opt.detail ?? 'list (one per line)',
        apply: (view, completion, from, to) => {
          const line = view.state.doc.lineAt(from);
          const indent = line.text.match(/^\s*/)?.[0] ?? '';
          const nextIndent = indent + '  ';
          const insert = `options:\n${nextIndent}- `;
          view.dispatch({
            ...insertCompletionText(view.state, insert, from, to),
            annotations: [pickedCompletion.of(completion)],
          });
        },
      };
    });

    return { ...result, options };
  };
}

const QUESTION_TYPES: { value: string; detail: string }[] = [
  { value: 'choice', detail: 'Multiple choice' },
  { value: 'input', detail: 'Fill in the blank' },
];

/**
 * Custom completion source: when typing the value for `type:` in a question,
 * show "choice" (Multiple choice) and "input" (Fill in the blank).
 */
export function questionTypeCompletion(ctx: CompletionContext): CompletionResult | null {
  const pointer = jsonPointerForPosition(ctx.state, ctx.pos, -1, MODES_YAML);
  if (!pointer.endsWith('/type')) return null;

  const match = ctx.matchBefore(/[a-z]*/);
  const from = match ? match.from : ctx.pos;
  const to = ctx.pos;

  const completions: Completion[] = QUESTION_TYPES.map(({ value, detail }) => ({
    label: value,
    detail,
    type: 'constant',
    apply: value,
  }));

  return {
    from,
    to,
    options: completions,
    filter: false,
  };
}
