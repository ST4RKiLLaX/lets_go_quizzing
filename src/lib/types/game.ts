import type { Quiz } from './quiz.js';

export interface SerializedPlayer {
  id: string;
  name: string;
  emoji: string;
  score: number;
  isActive?: boolean;
}

export interface SerializedPendingPlayer {
  playerId: string;
  socketId: string;
  name: string;
  emoji: string;
  requestedAt: number;
}

export interface SerializedSubmission {
  playerId: string;
  questionId: string;
  answerIndex?: number;
  answerIndexes?: number[];
  answerNumber?: number;
  answerText?: string;
  answerX?: number;
  answerY?: number;
  submittedAt?: number;
  visibility?: 'visible' | 'blocked';
  projectorHiddenByHost?: boolean;
}

export interface SerializedWrongAnswer {
  playerId: string;
  questionId: string;
  answer: string | number | number[];
}

export interface SerializedState {
  type: string;
  roomId: string;
  quiz: Quiz;
  quizFilename?: string;
  serverNow?: number;
  players: SerializedPlayer[];
  pendingPlayers?: SerializedPendingPlayer[];
  waitingRoomEnabled?: boolean;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  submissions: SerializedSubmission[];
  wrongAnswers: SerializedWrongAnswer[];
  timerEndsAt?: number;
  startedAt?: number;
  hiddenWordsByQuestion?: Record<string, string[]>;
}

export interface SerializedRoomPatch {
  roomId: string;
  type: string;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  players: SerializedPlayer[];
  pendingPlayers?: SerializedPendingPlayer[];
}

export interface SerializedHotspotSubmissionPatch {
  playerId: string;
  answerX: number;
  answerY: number;
}

export interface SerializedQuestionPatch {
  roomId: string;
  type: 'Question';
  currentRoundIndex: number;
  currentQuestionIndex: number;
  questionId: string;
  submittedCount: number;
  answeredPlayerIds: string[];
  optionCounts?: Record<string, number>;
  hotspotSubmissions?: SerializedHotspotSubmissionPatch[];
}
