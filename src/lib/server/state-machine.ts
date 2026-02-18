import type { Quiz, Question } from './parser.js';

export type GameStateType =
  | 'Lobby'
  | 'Question'
  | 'RevealAnswer'
  | 'Scoreboard'
  | 'End';

export interface Player {
  id: string;
  name: string;
  emoji: string;
  score: number;
  socketId?: string;
}

export interface AnswerSubmission {
  playerId: string;
  questionId: string;
  answerIndex?: number;
  answerText?: string;
  submittedAt: number;
}

export interface GameState {
  type: GameStateType;
  roomId: string;
  quiz: Quiz;
  quizFilename: string;
  hostSocketId: string;
  players: Map<string, Player>;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  submissions: AnswerSubmission[];
  wrongAnswers: Array<{ playerId: string; questionId: string; answer: string | number }>;
  timerEndsAt?: number;
  startedAt?: number;
}

export type GameEvent =
  | { type: 'START_GAME' }
  | { type: 'NEXT' }
  | { type: 'STOP_TIMER' }
  | { type: 'SHOW_LEADERBOARD' }
  | { type: 'END_GAME' };

function getCurrentQuestion(state: GameState): Question | null {
  const round = state.quiz.rounds[state.currentRoundIndex];
  if (!round) return null;
  return round.questions[state.currentQuestionIndex] ?? null;
}

function hasNextQuestion(state: GameState): boolean {
  const round = state.quiz.rounds[state.currentRoundIndex];
  if (!round) return false;
  return state.currentQuestionIndex < round.questions.length - 1;
}

function hasNextRound(state: GameState): boolean {
  return state.currentRoundIndex < state.quiz.rounds.length - 1;
}

export function transition(
  state: GameState,
  event: GameEvent
): GameState {
  const st = state.type;
  if (st === 'Lobby') {
    if (event.type === 'START_GAME') {
      return {
        ...state,
        type: 'Question',
        currentRoundIndex: 0,
        currentQuestionIndex: 0,
        startedAt: Date.now(),
        timerEndsAt: state.quiz.meta.default_timer
          ? Date.now() + state.quiz.meta.default_timer * 1000
          : undefined,
      };
    }
  } else if (st === 'Question') {
    if (event.type === 'NEXT' || event.type === 'STOP_TIMER') {
      return {
        ...state,
        type: 'RevealAnswer',
        timerEndsAt: undefined,
      };
    }
  } else if (st === 'RevealAnswer') {
    if (event.type === 'NEXT') {
      if (hasNextQuestion(state)) {
        const timer = state.quiz.meta.default_timer;
        return {
          ...state,
          type: 'Question',
          currentQuestionIndex: state.currentQuestionIndex + 1,
          submissions: [],
          wrongAnswers: [],
          timerEndsAt: timer ? Date.now() + timer * 1000 : undefined,
        };
      }
      return {
        ...state,
        type: 'Scoreboard',
      };
    }
    if (event.type === 'SHOW_LEADERBOARD') {
      return {
        ...state,
        type: 'Scoreboard',
      };
    }
  } else if (st === 'Scoreboard') {
    if (event.type === 'NEXT') {
      if (hasNextRound(state) && !hasNextQuestion(state)) {
        const timer = state.quiz.meta.default_timer;
        return {
          ...state,
          type: 'Question',
          currentRoundIndex: state.currentRoundIndex + 1,
          currentQuestionIndex: 0,
          submissions: [],
          wrongAnswers: [],
          timerEndsAt: timer ? Date.now() + timer * 1000 : undefined,
        };
      }
      if (!hasNextRound(state) && !hasNextQuestion(state)) {
        return {
          ...state,
          type: 'End',
        };
      }
    }
    if (event.type === 'END_GAME') {
      return {
        ...state,
        type: 'End',
      };
    }
  }

  return state;
}

export function createInitialState(
  roomId: string,
  quiz: Quiz,
  quizFilename: string,
  hostSocketId: string
): GameState {
  return {
    type: 'Lobby',
    roomId,
    quiz,
    quizFilename,
    hostSocketId,
    players: new Map(),
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
  };
}
