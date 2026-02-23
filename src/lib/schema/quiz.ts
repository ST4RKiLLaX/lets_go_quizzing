import { z } from 'zod';

function isValidImageUrl(val: string): { ok: true } | { ok: false; message: string } {
  if (!val || val.trim() === '') return { ok: true };
  const trimmed = val.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { ok: true }; // filename (e.g. q1.png)
  }
  if (/\s/.test(trimmed)) {
    return {
      ok: false,
      message: 'Remove spaces from the URL. Use https://example.com not "https: //example.com".',
    };
  }
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, message: 'Image URL must use http or https.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Image URL must be a valid http or https URL.' };
  }
}

const imageSchema = z
  .string()
  .optional()
  .refine(
    (val) => isValidImageUrl(val ?? '').ok,
    (val) => {
      const r = isValidImageUrl(val ?? '');
      return { message: r.ok ? 'Invalid image URL' : r.message };
    }
  );

const ChoiceQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('choice'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  options: z.array(z.string()),
  answer: z.number().int().min(0),
});

const InputQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('input'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  answer: z.union([z.string(), z.array(z.string())]).transform((v) =>
    Array.isArray(v) ? v : [v]
  ),
});

const QuestionSchema = z.discriminatedUnion('type', [
  ChoiceQuestionSchema,
  InputQuestionSchema,
]);

const RoundSchema = z
  .object({
    name: z.string(),
    questions: z.array(QuestionSchema),
  })
  .refine(
    (round) =>
      round.questions.every((q) =>
        q.type !== 'choice' || (q.answer >= 0 && q.answer < q.options.length)
      ),
    { message: 'choice answer must be less than options length' }
  );

const QuizMetaSchema = z.object({
  name: z.string(),
  author: z.string().optional(),
  default_timer: z.number().int().min(0).optional(),
  fuzzy_threshold: z.number().min(0).max(1).optional(),
  scoring_mode: z.enum(['standard', 'ranked']).optional(),
  option_label_style: z.enum(['letters', 'numbers']).optional(),
  ranked_max_points: z.number().int().min(0).optional(),
  ranked_min_points: z.number().int().min(0).optional(),
});

export const QuizSchema = z.object({
  meta: QuizMetaSchema,
  rounds: z.array(RoundSchema),
});

export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;
export type InputQuestion = z.infer<typeof InputQuestionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type QuizMeta = z.infer<typeof QuizMetaSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
