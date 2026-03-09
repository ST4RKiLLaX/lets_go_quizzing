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
  options: string[];
  answer: number;
}

export interface TrueFalseQuestion {
  id: string;
  type: 'true_false';
  text: string;
  explanation?: string;
  image?: string;
  answer: boolean;
}

export interface PollQuestion {
  id: string;
  type: 'poll';
  text: string;
  explanation?: string;
  image?: string;
  options: string[];
}

export interface InputQuestion {
  id: string;
  type: 'input';
  text: string;
  explanation?: string;
  image?: string;
  answer: string[];
}

export type Question = ChoiceQuestion | TrueFalseQuestion | PollQuestion | InputQuestion;

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

export function createEmptyInputQuestion(id: string): InputQuestion {
  return {
    id,
    type: 'input',
    text: '',
    answer: [''],
  };
}

export function generateQuestionId(roundIndex: number, questionIndex: number): string {
  return `q${roundIndex + 1}_${questionIndex + 1}`;
}
