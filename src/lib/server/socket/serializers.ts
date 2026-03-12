import type { GameState } from '../game/state-machine.js';

export function serializeSubmissions(
  submissions: GameState['submissions'],
  options: { forHost: boolean; forProjector?: boolean }
) {
  const { forHost, forProjector } = options;
  if (forHost || forProjector) {
    return submissions.map((s) => {
      if (s.visibility === 'blocked') {
        const { answerText: _, ...rest } = s;
        return { ...rest, visibility: 'blocked' as const, projectorHiddenByHost: s.projectorHiddenByHost ?? false };
      }
      return { ...s, projectorHiddenByHost: s.projectorHiddenByHost ?? false };
    });
  }
  return submissions.filter((s) => s.visibility !== 'blocked');
}

export function serializeState(state: GameState, submissions: typeof state.submissions) {
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
    players: Array.from(players.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      emoji: p.emoji,
      score: p.score,
      isActive: !!p.socketId,
    })),
  };
}

export function serializeHostState(state: GameState) {
  const base = serializeState(state, serializeSubmissions(state.submissions, { forHost: true }));
  const pendingPlayers = state.pendingPlayers
    ? Array.from(state.pendingPlayers.values()).map((p) => ({
        playerId: p.playerId,
        socketId: p.socketId,
        name: p.name,
        emoji: p.emoji,
        requestedAt: p.requestedAt,
      }))
    : [];
  const hiddenWordsByQuestion: Record<string, string[]> = {};
  const hwMap = state.hiddenWordsByQuestion ?? new Map();
  for (const [qId, set] of hwMap) {
    hiddenWordsByQuestion[qId] = Array.from(set);
  }
  return {
    ...base,
    pendingPlayers,
    waitingRoomEnabled: state.waitingRoomEnabled,
    allowLateJoin: state.allowLateJoin,
    autoAdmitBeforeGame: state.autoAdmitBeforeGame,
    manualAdmitAfterGame: state.manualAdmitAfterGame,
    hiddenWordsByQuestion: Object.keys(hiddenWordsByQuestion).length > 0 ? hiddenWordsByQuestion : undefined,
  };
}

export function serializePlayerState(state: GameState) {
  const base = serializeState(state, serializeSubmissions(state.submissions, { forHost: false }));
  const { type, currentRoundIndex, currentQuestionIndex } = state;
  const isRevealPhase = type === 'RevealAnswer' || type === 'Scoreboard' || type === 'End';
  const quiz = {
    ...state.quiz,
    rounds: state.quiz.rounds.map((round, r) => ({
      ...round,
      questions: round.questions.map((q, i) => {
        const revealed =
          r < currentRoundIndex ||
          (r === currentRoundIndex && (isRevealPhase ? i <= currentQuestionIndex : i < currentQuestionIndex));
        if (revealed || !('answer' in q)) return q;
        const { answer: _answer, ...rest } = q as { answer?: unknown; [k: string]: unknown };
        return rest;
      }),
    })),
  };
  return { ...base, quiz };
}

export function serializeProjectorState(state: GameState) {
  const submissions = serializeSubmissions(state.submissions, { forHost: true, forProjector: true });
  const base = serializeState(state, submissions);
  const hiddenWordsByQuestion: Record<string, string[]> = {};
  const map = state.hiddenWordsByQuestion ?? new Map();
  for (const [qId, set] of map) {
    hiddenWordsByQuestion[qId] = Array.from(set);
  }
  return {
    ...base,
    hiddenWordsByQuestion: Object.keys(hiddenWordsByQuestion).length > 0 ? hiddenWordsByQuestion : undefined,
  };
}
