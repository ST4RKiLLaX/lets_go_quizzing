export interface QuizMeta {
  name: string;
  author?: string;
  default_timer?: number;
  fuzzy_threshold?: number;
  scoring_mode?: 'standard' | 'ranked';
  option_label_style?: 'letters' | 'numbers';
  ranked_max_points?: number;
  ranked_min_points?: number;
}

export interface ChoiceQuestion {
  id: string;
  type: 'choice';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  options: string[];
  answer: number;
}

export interface TrueFalseQuestion {
  id: string;
  type: 'true_false';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  answer: boolean;
}

export interface PollQuestion {
  id: string;
  type: 'poll';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  options: string[];
}

export interface MultiSelectQuestion {
  id: string;
  type: 'multi_select';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  options: string[];
  answer: number[];
}

export interface SliderQuestion {
  id: string;
  type: 'slider';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  min: number;
  max: number;
  step: number;
  answer: number;
}

export interface InputQuestion {
  id: string;
  type: 'input';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  answer: string[];
}

export interface OpenEndedQuestion {
  id: string;
  type: 'open_ended';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
}

export interface WordCloudQuestion {
  id: string;
  type: 'word_cloud';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
}

export interface ReorderQuestion {
  id: string;
  type: 'reorder';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  options: string[];
  answer: number[];
}

export interface HotspotQuestion {
  id: string;
  type: 'hotspot';
  text: string;
  explanation?: string;
  image: string;
  imageAspectRatio?: number;
  points?: number;
  answer: { x: number; y: number; radius: number; radiusY?: number; rotation?: number };
}

export interface MatchingQuestion {
  id: string;
  type: 'matching';
  text: string;
  explanation?: string;
  image?: string;
  points?: number;
  items: string[];
  options: string[];
  answer: number[];
}

export type Question =
  | ChoiceQuestion
  | TrueFalseQuestion
  | PollQuestion
  | MultiSelectQuestion
  | SliderQuestion
  | InputQuestion
  | OpenEndedQuestion
  | WordCloudQuestion
  | ReorderQuestion
  | HotspotQuestion
  | MatchingQuestion;

export interface Round {
  name: string;
  questions: Question[];
}

export interface Quiz {
  meta: QuizMeta;
  rounds: Round[];
}

export function createEmptyQuiz(): Quiz {
  return {
    meta: { name: 'Untitled Quiz', author: '', default_timer: 30 },
    rounds: [{ name: 'Round 1', questions: [createEmptyChoiceQuestion('q1')] }],
  };
}

export function createEmptyChoiceQuestion(id: string): ChoiceQuestion {
  return {
    id,
    type: 'choice',
    text: '',
    options: ['', ''],
    answer: 0,
  };
}

export function createEmptyTrueFalseQuestion(id: string): TrueFalseQuestion {
  return {
    id,
    type: 'true_false',
    text: '',
    answer: true,
  };
}

export function createEmptyPollQuestion(id: string): PollQuestion {
  return {
    id,
    type: 'poll',
    text: '',
    options: ['', ''],
  };
}

export function createEmptyMultiSelectQuestion(id: string): MultiSelectQuestion {
  return {
    id,
    type: 'multi_select',
    text: '',
    options: ['', ''],
    answer: [0],
  };
}

export function createEmptySliderQuestion(id: string): SliderQuestion {
  return {
    id,
    type: 'slider',
    text: '',
    min: 0,
    max: 10,
    step: 1,
    answer: 5,
  };
}

export function createEmptyInputQuestion(id: string): InputQuestion {
  return {
    id,
    type: 'input',
    text: '',
    answer: [''],
  };
}

export function createEmptyOpenEndedQuestion(id: string): OpenEndedQuestion {
  return {
    id,
    type: 'open_ended',
    text: '',
  };
}

export function createEmptyWordCloudQuestion(id: string): WordCloudQuestion {
  return {
    id,
    type: 'word_cloud',
    text: '',
  };
}

export function createEmptyReorderQuestion(id: string): ReorderQuestion {
  return {
    id,
    type: 'reorder',
    text: '',
    options: ['', ''],
    answer: [0, 1],
  };
}

export function createEmptyHotspotQuestion(id: string): HotspotQuestion {
  return {
    id,
    type: 'hotspot',
    text: '',
    image: '',
    answer: { x: 0.5, y: 0.5, radius: 0.1 },
  };
}

export function createEmptyMatchingQuestion(id: string): MatchingQuestion {
  return {
    id,
    type: 'matching',
    text: '',
    items: ['', ''],
    options: ['', '', '', ''],
    answer: [0, 1],
  };
}

export function generateQuestionId(roundIndex: number, questionIndex: number): string {
  return `q${roundIndex + 1}_${questionIndex + 1}`;
}
