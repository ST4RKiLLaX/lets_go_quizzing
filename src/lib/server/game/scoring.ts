import { compareTwoStrings } from 'string-similarity';
import type { GameState, AnswerSubmission } from './state-machine.js';
import type { ChoiceQuestion, InputQuestion } from '../storage/parser.js';

const DEFAULT_FUZZY_THRESHOLD = 0.85;

function isChoiceCorrect(
  question: ChoiceQuestion,
  submission: AnswerSubmission
): boolean {
  if (submission.answerIndex === undefined) return false;
  return submission.answerIndex === question.answer;
}

function isInputCorrectExact(
  question: InputQuestion,
  submission: AnswerSubmission
): boolean {
  if (submission.answerText === undefined) return false;
  const normalized = submission.answerText.trim().toLowerCase();
  return question.answer.some(
    (a) => a.trim().toLowerCase() === normalized
  );
}

function isInputCorrectFuzzy(
  question: InputQuestion,
  submission: AnswerSubmission,
  threshold: number
): boolean {
  if (submission.answerText === undefined) return false;
  const normalized = submission.answerText.trim().toLowerCase();
  return question.answer.some((a) => {
    const target = a.trim().toLowerCase();
    return compareTwoStrings(normalized, target) >= threshold;
  });
}

function isCorrect(
  question: ChoiceQuestion | InputQuestion,
  submission: AnswerSubmission,
  fuzzyThreshold: number
): boolean {
  if (question.type === 'choice') {
    return isChoiceCorrect(question, submission);
  }
  return (
    isInputCorrectExact(question, submission) ||
    isInputCorrectFuzzy(question, submission, fuzzyThreshold)
  );
}

export function scoreSubmissions(
  state: GameState,
  basePoints = 1
): GameState {
  const round = state.quiz.rounds[state.currentRoundIndex];
  if (!round) return state;

  const question = round.questions[state.currentQuestionIndex];
  if (!question) return state;

  const fuzzyThreshold =
    state.quiz.meta.fuzzy_threshold ?? DEFAULT_FUZZY_THRESHOLD;
  const players = new Map(state.players);

  const wrongAnswers: typeof state.wrongAnswers = [];

  const scoringMode = state.quiz.meta.scoring_mode ?? 'standard';

  if (scoringMode === 'ranked') {
    const maxPts = state.quiz.meta.ranked_max_points ?? 100;
    const minPts = state.quiz.meta.ranked_min_points ?? 10;

    const correct = state.submissions
      .filter((sub) => players.has(sub.playerId) && isCorrect(question, sub, fuzzyThreshold))
      .sort((a, b) => a.submittedAt - b.submittedAt);

    let currentRank = 1;
    let prevTime = -1;
    for (let i = 0; i < correct.length; i++) {
      const sub = correct[i];
      if (sub.submittedAt !== prevTime) {
        currentRank = i + 1;
        prevTime = sub.submittedAt;
      }
      const pts =
        correct.length === 1
          ? maxPts
          : Math.round(
              maxPts - ((currentRank - 1) * (maxPts - minPts)) / (correct.length - 1)
            );
      const player = players.get(sub.playerId)!;
      players.set(sub.playerId, { ...player, score: player.score + pts });
    }

    for (const sub of state.submissions) {
      const player = players.get(sub.playerId);
      if (!player) continue;
      if (!isCorrect(question, sub, fuzzyThreshold)) {
        wrongAnswers.push({
          playerId: sub.playerId,
          questionId: question.id,
          answer:
            question.type === 'choice'
              ? (sub.answerIndex ?? -1)
              : (sub.answerText ?? ''),
        });
      }
    }
  } else {
    for (const sub of state.submissions) {
      const player = players.get(sub.playerId);
      if (!player) continue;

      const correct = isCorrect(question, sub, fuzzyThreshold);

      if (correct) {
        players.set(sub.playerId, {
          ...player,
          score: player.score + basePoints,
        });
      } else {
        wrongAnswers.push({
          playerId: sub.playerId,
          questionId: question.id,
          answer:
            question.type === 'choice'
              ? (sub.answerIndex ?? -1)
              : (sub.answerText ?? ''),
        });
      }
    }
  }

  return {
    ...state,
    players,
    wrongAnswers,
  };
}
