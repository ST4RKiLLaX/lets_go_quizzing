import type { Quiz } from '../storage/parser.js';
import type { RoomPrizeConfig } from '../../types/prizes.js';

export type GameStateType = 'Lobby' | 'QuestionPreview' | 'Question' | 'RevealAnswer' | 'Scoreboard' | 'End';

export interface Player {
  id: string;
  name: string;
  emoji: string;
  score: number;
  totalAnswerTimeMs?: number;
  socketId?: string;
}

export interface PendingPlayer {
  playerId: string;
  socketId: string;
  name: string;
  emoji: string;
  requestedAt: number;
}

export interface AnswerSubmission {
  playerId: string;
  questionId: string;
  answerIndex?: number;
  answerIndexes?: number[];
  answerNumber?: number;
  answerText?: string;
  answerX?: number;
  answerY?: number;
  submittedAt: number;
  visibility?: 'visible' | 'blocked';
  projectorHiddenByHost?: boolean;
}

export interface GameState {
  type: GameStateType;
  roomId: string;
  quiz: Quiz;
  quizFilename: string;
  playerJoinPassword?: string;
  hostSocketId: string;
  players: Map<string, Player>;
  pendingPlayers: Map<string, PendingPlayer>;
  waitingRoomEnabled?: boolean;
  allowLateJoin?: boolean;
  autoAdmitBeforeGame?: boolean;
  manualAdmitAfterGame?: boolean;
  roomPrizeConfig?: RoomPrizeConfig;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  submissions: AnswerSubmission[];
  wrongAnswers: Array<{ playerId: string; questionId: string; answer: string | number | number[] }>;
  bannedPlayerIds: Set<string>;
  hiddenWordsByQuestion: Map<string, Set<string>>;
  timerEndsAt?: number;
  startedAt?: number;
  questionStartedAt?: number;
}

export type GameEvent =
  | { type: 'START_GAME' }
  | { type: 'START_QUESTION' }
  | { type: 'NEXT' }
  | { type: 'STOP_TIMER' }
  | { type: 'SHOW_LEADERBOARD' }
  | { type: 'END_GAME' };

function hasNextQuestion(state: GameState): boolean {
  const round = state.quiz.rounds[state.currentRoundIndex];
  if (!round) return false;
  return state.currentQuestionIndex < round.questions.length - 1;
}

function hasNextRound(state: GameState): boolean {
  return state.currentRoundIndex < state.quiz.rounds.length - 1;
}

export function transition(state: GameState, event: GameEvent): GameState {
  const st = state.type;
  if (st === 'Lobby') {
    if (event.type === 'END_GAME') {
      return {
        ...state,
        type: 'End',
      };
    }
    if (event.type === 'START_GAME') {
      return {
        ...state,
        type: 'QuestionPreview',
        currentRoundIndex: 0,
        currentQuestionIndex: 0,
        startedAt: Date.now(),
      };
    }
  } else if (st === 'QuestionPreview') {
    if (event.type === 'END_GAME') {
      return {
        ...state,
        type: 'End',
      };
    }
    if (event.type === 'START_QUESTION') {
      const timer = state.quiz.meta.default_timer;
      const questionStartedAt = Date.now();
      return {
        ...state,
        type: 'Question',
        timerEndsAt: timer ? questionStartedAt + timer * 1000 : undefined,
        questionStartedAt,
      };
    }
  } else if (st === 'Question') {
    if (event.type === 'END_GAME') {
      return {
        ...state,
        type: 'End',
        timerEndsAt: undefined,
        questionStartedAt: undefined,
      };
    }
    if (event.type === 'NEXT' || event.type === 'STOP_TIMER') {
      return {
        ...state,
        type: 'RevealAnswer',
        timerEndsAt: undefined,
        questionStartedAt: undefined,
      };
    }
  } else if (st === 'RevealAnswer') {
    if (event.type === 'END_GAME') {
      return {
        ...state,
        type: 'End',
      };
    }
    if (event.type === 'NEXT') {
      if (hasNextQuestion(state)) {
        return {
          ...state,
          type: 'QuestionPreview',
          currentQuestionIndex: state.currentQuestionIndex + 1,
          submissions: [],
          wrongAnswers: [],
          questionStartedAt: undefined,
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
        return {
          ...state,
          type: 'QuestionPreview',
          currentRoundIndex: state.currentRoundIndex + 1,
          currentQuestionIndex: 0,
          submissions: [],
          wrongAnswers: [],
          questionStartedAt: undefined,
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

export function createInitialState(roomId: string, quiz: Quiz, quizFilename: string, hostSocketId: string): GameState {
  return {
    type: 'Lobby',
    roomId,
    quiz,
    quizFilename,
    hostSocketId,
    players: new Map(),
    pendingPlayers: new Map(),
    waitingRoomEnabled: false,
    allowLateJoin: false,
    autoAdmitBeforeGame: true,
    manualAdmitAfterGame: true,
    roomPrizeConfig: undefined,
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    submissions: [],
    wrongAnswers: [],
    bannedPlayerIds: new Set(),
    hiddenWordsByQuestion: new Map(),
    questionStartedAt: undefined,
  };
}
