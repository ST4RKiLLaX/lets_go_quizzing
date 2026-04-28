import type { Question } from '$lib/types/quiz.js';

export type PlayerQuestionSubmissionQueries = {
  hasSubmitted: (questionId: string) => boolean;
  getSubmittedAnswerIndex: (questionId: string) => number | undefined;
  getSubmittedAnswerIndexes: (questionId: string) => number[];
  getSubmittedHotspot: (questionId: string) => { x: number; y: number } | undefined;
  isHotspotSubmitted: (questionId: string) => boolean;
  isMultiSelectSubmitted: (questionId: string) => boolean;
  isReorderSubmitted: (questionId: string) => boolean;
  isMatchingSubmitted: (questionId: string) => boolean;
  isSliderSubmitted: (questionId: string) => boolean;
  isInputSubmitted: (questionId: string) => boolean;
  getSelectedOptionLabel: (q: Question) => string;
  getSelectedOptionLabels: (q: Question) => string[];
  getSubmittedAnswerNumber: (questionId: string) => number | undefined;
};
