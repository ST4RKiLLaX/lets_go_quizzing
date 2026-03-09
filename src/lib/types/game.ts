import type { Quiz } from './quiz.js';

export interface SerializedPlayer {
  id: string;
  name: string;
  emoji: string;
  score: number;
  isActive?: boolean;
}

export interface SerializedSubmission {
  playerId: string;
  questionId: string;
  answerIndex?: number;
  answerIndexes?: number[];
  answerNumber?: number;
  answerText?: string;
  submittedAt?: number;
}

export interface SerializedWrongAnswer {
  playerId: string;
  questionId: string;
  answer: string | number | number[];
}

export interface SerializedState {
  type: string;
  quiz: Quiz;
  quizFilename?: string;
  serverNow?: number;
  players: SerializedPlayer[];
  currentRoundIndex: number;
  currentQuestionIndex: number;
  submissions: SerializedSubmission[];
  wrongAnswers: SerializedWrongAnswer[];
  timerEndsAt?: number;
  startedAt?: number;
}
