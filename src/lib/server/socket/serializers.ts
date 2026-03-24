import type { GameState } from '../game/state-machine.js';
import type {
  SerializedPendingPlayer,
  SerializedPlayer,
  SerializedQuestionPatch,
  SerializedRoomPatch,
  SerializedSubmission,
} from '../../types/game.js';
import type { Quiz } from '../../types/quiz.js';

const playersCache = new WeakMap<GameState['players'], SerializedPlayer[]>();
const pendingPlayersCache = new WeakMap<GameState['pendingPlayers'], SerializedPendingPlayer[]>();
const hiddenWordsCache = new WeakMap<GameState['hiddenWordsByQuestion'], Record<string, string[]>>();
const hostSubmissionsCache = new WeakMap<GameState['submissions'], SerializedSubmission[]>();
const playerSubmissionsCache = new WeakMap<GameState['submissions'], SerializedSubmission[]>();
const projectorSubmissionsCache = new WeakMap<GameState['submissions'], SerializedSubmission[]>();
const playerQuizProjectionCache = new WeakMap<GameState['quiz'], Map<string, Quiz>>();

function getPlayerQuizProjectionKey(state: GameState): string {
  const isRevealPhase = state.type === 'RevealAnswer' || state.type === 'Scoreboard' || state.type === 'End';
  return `${state.type}:${state.currentRoundIndex}:${state.currentQuestionIndex}:${isRevealPhase ? '1' : '0'}`;
}

function serializePlayers(players: GameState['players']): SerializedPlayer[] {
  const cached = playersCache.get(players);
  if (cached) return cached;
  const serialized = Array.from(players.entries()).map(([id, player]) => ({
    id,
    name: player.name,
    emoji: player.emoji,
    score: player.score,
    isActive: !!player.socketId,
  }));
  playersCache.set(players, serialized);
  return serialized;
}

function serializePendingPlayers(pendingPlayers: GameState['pendingPlayers'] | undefined): SerializedPendingPlayer[] {
  if (!pendingPlayers || pendingPlayers.size === 0) return [];
  const cached = pendingPlayersCache.get(pendingPlayers);
  if (cached) return cached;
  const serialized = Array.from(pendingPlayers.values()).map((player) => ({
    playerId: player.playerId,
    socketId: player.socketId,
    name: player.name,
    emoji: player.emoji,
    requestedAt: player.requestedAt,
  }));
  pendingPlayersCache.set(pendingPlayers, serialized);
  return serialized;
}

function serializeHiddenWordsByQuestion(
  hiddenWordsByQuestion: GameState['hiddenWordsByQuestion'] | undefined
): Record<string, string[]> | undefined {
  if (!hiddenWordsByQuestion || hiddenWordsByQuestion.size === 0) return undefined;
  const cached = hiddenWordsCache.get(hiddenWordsByQuestion);
  if (cached) return Object.keys(cached).length > 0 ? cached : undefined;
  const serialized: Record<string, string[]> = {};
  for (const [questionId, hiddenWords] of hiddenWordsByQuestion) {
    serialized[questionId] = Array.from(hiddenWords);
  }
  hiddenWordsCache.set(hiddenWordsByQuestion, serialized);
  return Object.keys(serialized).length > 0 ? serialized : undefined;
}

function serializePlayerQuizProjection(state: GameState): Quiz {
  const key = getPlayerQuizProjectionKey(state);
  const byQuiz = playerQuizProjectionCache.get(state.quiz) ?? new Map<string, Quiz>();
  const cached = byQuiz.get(key);
  if (cached) return cached;
  const isRevealPhase = state.type === 'RevealAnswer' || state.type === 'Scoreboard' || state.type === 'End';
  const quiz = {
    ...state.quiz,
    rounds: state.quiz.rounds.map((round, roundIndex) => ({
      ...round,
      questions: round.questions.map((question, questionIndex) => {
        const revealed =
          roundIndex < state.currentRoundIndex ||
          (roundIndex === state.currentRoundIndex &&
            (isRevealPhase ? questionIndex <= state.currentQuestionIndex : questionIndex < state.currentQuestionIndex));
        if (revealed || !('answer' in question)) return question;
        const { answer: _answer, ...rest } = question as typeof question & { answer?: unknown };
        return rest as typeof question;
      }),
    })),
  } as Quiz;
  byQuiz.set(key, quiz);
  playerQuizProjectionCache.set(state.quiz, byQuiz);
  return quiz;
}

function buildOptionCounts(submissions: SerializedSubmission[], questionId: string): Record<string, number> | undefined {
  const counts: Record<string, number> = {};
  for (const submission of submissions) {
    if (submission.questionId !== questionId) continue;
    if (submission.answerIndex != null) {
      counts[String(submission.answerIndex)] = (counts[String(submission.answerIndex)] ?? 0) + 1;
    }
    if (submission.answerIndexes?.length) {
      for (const answerIndex of submission.answerIndexes) {
        counts[String(answerIndex)] = (counts[String(answerIndex)] ?? 0) + 1;
      }
    }
  }
  return Object.keys(counts).length > 0 ? counts : undefined;
}

export function serializeSubmissions(
  submissions: GameState['submissions'],
  options: { forHost: boolean; forProjector?: boolean }
): SerializedSubmission[] {
  const { forHost, forProjector } = options;
  if (forHost) {
    const cached = hostSubmissionsCache.get(submissions);
    if (cached) return cached;
  } else if (forProjector) {
    const cached = projectorSubmissionsCache.get(submissions);
    if (cached) return cached;
  } else {
    const cached = playerSubmissionsCache.get(submissions);
    if (cached) return cached;
  }

  let serialized: SerializedSubmission[];
  if (forHost || forProjector) {
    serialized = submissions.map((s) => {
      if (s.visibility === 'blocked') {
        const { answerText: _, ...rest } = s;
        return { ...rest, visibility: 'blocked' as const, projectorHiddenByHost: s.projectorHiddenByHost ?? false };
      }
      return { ...s, projectorHiddenByHost: s.projectorHiddenByHost ?? false };
    });
  } else {
    serialized = submissions.filter((s) => s.visibility !== 'blocked');
  }

  if (forHost) {
    hostSubmissionsCache.set(submissions, serialized);
  } else if (forProjector) {
    projectorSubmissionsCache.set(submissions, serialized);
  } else {
    playerSubmissionsCache.set(submissions, serialized);
  }
  return serialized;
}

export function serializeState(state: GameState, submissions: SerializedSubmission[]) {
  const {
    type,
    roomId,
    quiz,
    quizFilename,
    players,
    currentRoundIndex,
    currentQuestionIndex,
    wrongAnswers,
    timerEndsAt,
    startedAt,
  } = state;

  return {
    type,
    roomId,
    quiz,
    quizFilename,
    currentRoundIndex,
    currentQuestionIndex,
    submissions,
    wrongAnswers,
    timerEndsAt,
    startedAt,
    serverNow: Date.now(),
    players: serializePlayers(players),
  };
}

export function serializeHostState(state: GameState) {
  const base = serializeState(state, serializeSubmissions(state.submissions, { forHost: true }));
  return {
    ...base,
    pendingPlayers: serializePendingPlayers(state.pendingPlayers),
    waitingRoomEnabled: state.waitingRoomEnabled,
    allowLateJoin: state.allowLateJoin,
    autoAdmitBeforeGame: state.autoAdmitBeforeGame,
    manualAdmitAfterGame: state.manualAdmitAfterGame,
    hiddenWordsByQuestion: serializeHiddenWordsByQuestion(state.hiddenWordsByQuestion),
  };
}

export function serializePlayerState(state: GameState) {
  const base = serializeState(state, serializeSubmissions(state.submissions, { forHost: false }));
  const quiz = serializePlayerQuizProjection(state);
  return { ...base, quiz };
}

export function serializeProjectorState(state: GameState) {
  const submissions = serializeSubmissions(state.submissions, { forHost: true, forProjector: true });
  const base = serializeState(state, submissions);
  return {
    ...base,
    hiddenWordsByQuestion: serializeHiddenWordsByQuestion(state.hiddenWordsByQuestion),
  };
}

export function serializeRoomPatch(
  state: GameState,
  options: { forHost: boolean }
): SerializedRoomPatch {
  return {
    roomId: state.roomId,
    type: state.type,
    currentRoundIndex: state.currentRoundIndex,
    currentQuestionIndex: state.currentQuestionIndex,
    players: serializePlayers(state.players),
    pendingPlayers: options.forHost ? serializePendingPlayers(state.pendingPlayers) : undefined,
  };
}

export function serializeQuestionPatch(
  state: GameState,
  role: 'host' | 'projector'
): SerializedQuestionPatch | null {
  if (state.type !== 'Question') return null;
  const question = state.quiz.rounds[state.currentRoundIndex]?.questions[state.currentQuestionIndex];
  if (!question) return null;
  const submissions = serializeSubmissions(state.submissions, { forHost: true, forProjector: true });
  const answered = submissions.filter((submission) => submission.questionId === question.id);
  const patch: SerializedQuestionPatch = {
    roomId: state.roomId,
    type: 'Question',
    currentRoundIndex: state.currentRoundIndex,
    currentQuestionIndex: state.currentQuestionIndex,
    questionId: question.id,
    submittedCount: answered.length,
    answeredPlayerIds: answered.map((submission) => submission.playerId),
  };

  if (role === 'host') {
    if (
      question.type === 'choice' ||
      question.type === 'true_false' ||
      question.type === 'poll' ||
      question.type === 'multi_select'
    ) {
      patch.optionCounts = buildOptionCounts(answered, question.id);
    }
    if (question.type === 'hotspot') {
      const hotspotSubmissions = answered
        .filter(
          (submission) =>
            submission.answerX != null &&
            submission.answerY != null &&
            submission.visibility !== 'blocked' &&
            !submission.projectorHiddenByHost
        )
        .map((submission) => ({
          playerId: submission.playerId,
          answerX: submission.answerX!,
          answerY: submission.answerY!,
        }));
      if (hotspotSubmissions.length > 0) {
        patch.hotspotSubmissions = hotspotSubmissions;
      }
    }
  }

  return patch;
}
