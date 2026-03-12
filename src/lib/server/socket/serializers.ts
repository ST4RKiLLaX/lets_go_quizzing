import type { GameState } from '../game/state-machine.js';

export function serializeSubmissions(submissions: GameState['submissions'], forHost: boolean) {
  if (forHost) {
    return submissions.map((s) => {
      if (s.visibility === 'blocked') {
        const { answerText: _, ...rest } = s;
        return { ...rest, visibility: 'blocked' as const };
      }
      return s;
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
  const base = serializeState(state, serializeSubmissions(state.submissions, true));
  const pendingPlayers = state.pendingPlayers
    ? Array.from(state.pendingPlayers.values()).map((p) => ({
        playerId: p.playerId,
        socketId: p.socketId,
        name: p.name,
        emoji: p.emoji,
        requestedAt: p.requestedAt,
      }))
    : [];
  return {
    ...base,
    pendingPlayers,
    waitingRoomEnabled: state.waitingRoomEnabled,
    allowLateJoin: state.allowLateJoin,
    autoAdmitBeforeGame: state.autoAdmitBeforeGame,
    manualAdmitAfterGame: state.manualAdmitAfterGame,
  };
}

export function serializePlayerState(state: GameState) {
  const base = serializeState(state, serializeSubmissions(state.submissions, false));
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
