import type { Readable } from 'svelte/store';
import type { Question } from '$lib/types/quiz.js';

export type PlayerQuestionPresentation = {
  question: Question;
  roundName: string;
  currentQuestionNumber: number;
  currentRoundQuestionTotal: number;
  roomId: string;
  quizFilename?: string;
  optionLabelStyle: 'letters' | 'numbers';
};

export type PlayerQuestionTimer = {
  totalTimerSeconds: number;
  countdown: Readable<number> | null;
  questionTimeExpired: boolean;
};

export type PlayerQuestionPendingUi = {
  hasAnsweredCurrentQuestion: boolean;
  showTimesUpMessage: boolean;
  submitError: string;
  selectedAnswer: { questionId: string; answerIndex: number } | null;
  selectedMultiSelect: { questionId: string; answerIndexes: number[] } | null;
};

export type PlayerQuestionActions = {
  submitChoice: (questionId: string, answerIndex: number) => void;
  submitMultiSelect: (questionId: string, answerIndexes: number[]) => void;
  submitReorder: (questionId: string, answerIndexes: number[]) => void;
  submitMatching: (questionId: string, answerIndexes: number[]) => void;
  submitSlider: (questionId: string, answerNumber: number) => void;
  submitHotspot: (questionId: string, x: number, y: number) => void;
  submitInput: (questionId: string, answerText: string) => void;
  toggleMultiSelectDraft: (optionIndex: number) => void;
};
