import { compareTwoStrings } from 'string-similarity';
import type { GameState, AnswerSubmission } from './state-machine.js';
import type {
  ChoiceQuestion,
  TrueFalseQuestion,
  PollQuestion,
  MultiSelectQuestion,
  SliderQuestion,
  InputQuestion,
  OpenEndedQuestion,
  WordCloudQuestion,
  ReorderQuestion,
  HotspotQuestion,
} from '../storage/parser.js';

const DEFAULT_FUZZY_THRESHOLD = 0.85;

function isChoiceCorrect(
  question: ChoiceQuestion,
  submission: AnswerSubmission
): boolean {
  if (submission.answerIndex === undefined) return false;
  return submission.answerIndex === question.answer;
}

function isTrueFalseCorrect(
  question: TrueFalseQuestion,
  submission: AnswerSubmission
): boolean {
  if (submission.answerIndex === undefined) return false;
  return submission.answerIndex === (question.answer ? 0 : 1);
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

function isMultiSelectCorrect(
  question: MultiSelectQuestion,
  submission: AnswerSubmission
): boolean {
  if (!submission.answerIndexes?.length) return false;
  const actual = [...new Set(submission.answerIndexes)].sort((a, b) => a - b);
  const expected = [...new Set(question.answer)].sort((a, b) => a - b);
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function isSliderCorrect(
  question: SliderQuestion,
  submission: AnswerSubmission
): boolean {
  if (submission.answerNumber == null) return false;
  return Math.abs(submission.answerNumber - question.answer) < 1e-9;
}

function isReorderCorrect(
  question: ReorderQuestion,
  submission: AnswerSubmission
): boolean {
  if (!submission.answerIndexes?.length || submission.answerIndexes.length !== question.answer.length) return false;
  return submission.answerIndexes.every((value, index) => value === question.answer[index]);
}

function isHotspotCorrect(
  question: HotspotQuestion,
  submission: AnswerSubmission
): boolean {
  if (submission.answerX == null || submission.answerY == null) return false;
  const ar = question.imageAspectRatio ?? 1;
  const { x: ax, y: ay, radius, radiusY, rotation = 0 } = question.answer;
  const rX = radius;
  const rY = radiusY ?? radius;
  let u = (submission.answerX - ax) * ar;
  let v = submission.answerY - ay;
  if (rotation !== 0) {
    const theta = (-rotation * Math.PI) / 180;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const uRot = u * c - v * s;
    const vRot = u * s + v * c;
    u = uRot;
    v = vRot;
  }
  return (u * u) / (rX * rX) + (v * v) / (rY * rY) <= 1;
}

function isCorrect(
  question:
    | ChoiceQuestion
    | TrueFalseQuestion
    | PollQuestion
    | MultiSelectQuestion
    | SliderQuestion
    | InputQuestion
    | OpenEndedQuestion
    | WordCloudQuestion
    | ReorderQuestion
    | HotspotQuestion,
  submission: AnswerSubmission,
  fuzzyThreshold: number
): boolean {
  if (question.type === 'choice') {
    return isChoiceCorrect(question, submission);
  }
  if (question.type === 'true_false') {
    return isTrueFalseCorrect(question, submission);
  }
  if (question.type === 'poll' || question.type === 'open_ended' || question.type === 'word_cloud') {
    return false;
  }
  if (question.type === 'multi_select') {
    return isMultiSelectCorrect(question, submission);
  }
  if (question.type === 'reorder') {
    return isReorderCorrect(question, submission);
  }
  if (question.type === 'hotspot') {
    return isHotspotCorrect(question, submission);
  }
  if (question.type === 'slider') {
    return isSliderCorrect(question, submission);
  }
  return (
    isInputCorrectExact(question, submission) ||
    isInputCorrectFuzzy(question, submission, fuzzyThreshold)
  );
}

function getWrongAnswerValue(
  submission: AnswerSubmission
): string | number | number[] {
  if (submission.answerX != null && submission.answerY != null) {
    return [submission.answerX, submission.answerY];
  }
  if (submission.answerIndexes?.length) {
    return submission.answerIndexes;
  }
  if (submission.answerNumber != null) {
    return submission.answerNumber;
  }
  if (submission.answerIndex != null) {
    return submission.answerIndex;
  }
  return submission.answerText ?? '';
}

export function scoreSubmissions(
  state: GameState,
  basePoints = 1
): GameState {
  const round = state.quiz.rounds[state.currentRoundIndex];
  if (!round) return state;

  const question = round.questions[state.currentQuestionIndex];
  if (!question) return state;
  if (question.type === 'poll' || question.type === 'open_ended' || question.type === 'word_cloud') {
    return {
      ...state,
      wrongAnswers: [],
    };
  }

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
            getWrongAnswerValue(sub),
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
            getWrongAnswerValue(sub),
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
