export interface QuizMeta {
  name: string;
  author?: string;
  default_timer?: number;
  fuzzy_threshold?: number;
}

export interface ChoiceQuestion {
  id: string;
  type: 'choice';
  text: string;
  options: string[];
  answer: number;
}

export interface InputQuestion {
  id: string;
  type: 'input';
  text: string;
  answer: string[];
}

export type Question = ChoiceQuestion | InputQuestion;

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
