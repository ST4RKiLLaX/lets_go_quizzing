import { compareTwoStrings } from 'string-similarity';
import type { GameState, AnswerSubmission } from './state-machine.js';
import type { ChoiceQuestion, InputQuestion } from './parser.js';

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

  for (const sub of state.submissions) {
    const player = players.get(sub.playerId);
    if (!player) continue;

    let correct = false;
    if (question.type === 'choice') {
      correct = isChoiceCorrect(question, sub);
    } else {
      correct =
        isInputCorrectExact(question, sub) ||
        isInputCorrectFuzzy(question, sub, fuzzyThreshold);
    }

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

  return {
    ...state,
    players,
    wrongAnswers,
  };
}
