import type { QuizMeta } from '$lib/types/quiz.js';

export type OptionLabelStyle = NonNullable<QuizMeta['option_label_style']>;

export function getOptionLabelStyle(meta: QuizMeta | undefined): OptionLabelStyle {
  return meta?.option_label_style ?? 'letters';
}

export function formatOptionLabel(index: number, style: OptionLabelStyle): string {
  if (style === 'numbers') return String(index + 1);
  return String.fromCharCode(65 + index);
}
