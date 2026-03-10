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

const imageSchema = z.string().optional().superRefine((val, ctx) => {
  const r = isValidImageUrl(val ?? '');
  if (!r.ok) {
    ctx.addIssue({
      code: 'custom',
      message: r.message,
    });
  }
});

const ChoiceQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('choice'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  options: z.array(z.string()),
  answer: z.number().int().min(0),
});

const TrueFalseQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('true_false'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  answer: z.boolean(),
});

const PollQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('poll'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  options: z.array(z.string()).min(2),
});

const MultiSelectQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('multi_select'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  options: z.array(z.string()).min(2),
  answer: z.array(z.number().int().min(0)).min(1),
});

const SliderQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('slider'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  answer: z.number(),
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

const OpenEndedQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('open_ended'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
});

const WordCloudQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('word_cloud'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
});

const ReorderQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('reorder'),
  text: z.string(),
  explanation: z.string().optional(),
  image: imageSchema,
  options: z.array(z.string()).min(2),
  answer: z.array(z.number().int().min(0)).min(2),
});

const QuestionSchema = z.discriminatedUnion('type', [
  ChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  PollQuestionSchema,
  MultiSelectQuestionSchema,
  SliderQuestionSchema,
  InputQuestionSchema,
  OpenEndedQuestionSchema,
  WordCloudQuestionSchema,
  ReorderQuestionSchema,
]);

const RoundSchema = z
  .object({
    name: z.string(),
    questions: z.array(QuestionSchema),
  })
  .refine(
    (round) =>
      round.questions.every((q) =>
        (q.type !== 'choice' || (q.answer >= 0 && q.answer < q.options.length)) &&
        (q.type !== 'multi_select' ||
          (new Set(q.answer).size === q.answer.length &&
            q.answer.every((answerIndex) => answerIndex >= 0 && answerIndex < q.options.length))) &&
                  (q.type !== 'reorder' ||
                    (q.answer.length === q.options.length &&
                      new Set(q.answer).size === q.answer.length &&
                      q.answer.every((answerIndex) => answerIndex >= 0 && answerIndex < q.options.length))) &&
        (q.type !== 'slider' ||
          (q.max > q.min &&
            q.answer >= q.min &&
            q.answer <= q.max &&
            Math.abs((q.answer - q.min) / q.step - Math.round((q.answer - q.min) / q.step)) < 1e-9))
      ),
    {
        message:
          'choice answers must be valid indices, multi_select answers must be unique valid indices, reorder answers must be a full unique ordering, and slider answers must fit the min/max/step range',
      }
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
export type TrueFalseQuestion = z.infer<typeof TrueFalseQuestionSchema>;
export type PollQuestion = z.infer<typeof PollQuestionSchema>;
export type MultiSelectQuestion = z.infer<typeof MultiSelectQuestionSchema>;
export type SliderQuestion = z.infer<typeof SliderQuestionSchema>;
export type InputQuestion = z.infer<typeof InputQuestionSchema>;
export type OpenEndedQuestion = z.infer<typeof OpenEndedQuestionSchema>;
export type WordCloudQuestion = z.infer<typeof WordCloudQuestionSchema>;
export type ReorderQuestion = z.infer<typeof ReorderQuestionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type QuizMeta = z.infer<typeof QuizMetaSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
