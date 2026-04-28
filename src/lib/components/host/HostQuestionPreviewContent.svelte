<script lang="ts">
  import { HOST_QUESTION_HINTS, QUESTION_TYPE_LABELS } from '$lib/constants/question-copy.js';
  import type { SerializedState } from '$lib/types/game.js';
  import type { Question } from '$lib/types/quiz.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';

  export let state: SerializedState;
  export let question: Question;
  export let currentRoundQuestionTotal = 0;
  export let currentQuestionNumber = 0;
  export let previewElapsedSeconds = 0;
  export let hostActionClass = '';
  export let hostActionLabel = '';
  export let onNext: () => void;
</script>

<div class="bg-pub-darker rounded-lg p-4 sm:p-6">
  <div class="flex items-start justify-between gap-4 mb-2">
    <p class="text-pub-gold text-base font-semibold">
      {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
    </p>
    <span class="text-pub-muted text-sm tabular-nums">{Math.floor(previewElapsedSeconds / 60)}:{String(previewElapsedSeconds % 60).padStart(2, '0')}</span>
  </div>
  <span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-pub-dark text-pub-muted mb-3">
    {QUESTION_TYPE_LABELS[question.type] ?? question.type}
  </span>
  <p class="text-xl mb-4">{question.text}</p>
  {#if question.type === 'hotspot' && question.image}
    {@const src = getQuestionImageSrc(question.image, state?.quizFilename)}
    {#if src}
      <img src={src} alt="" class="max-w-full rounded-lg my-4" />
    {/if}
  {:else if question.image}
    {@const src = getQuestionImageSrc(question.image, state?.quizFilename)}
    {#if src}
      <img src={src} alt="" class="max-w-full rounded-lg my-4" />
    {/if}
  {/if}
  <p class="text-sm text-pub-muted mb-6">{HOST_QUESTION_HINTS[question.type] ?? ''}</p>
  {#if currentRoundQuestionTotal > 0}
    <p class="text-center text-sm font-medium text-pub-muted mb-4">
      {currentQuestionNumber}/{currentRoundQuestionTotal}
    </p>
  {/if}
  <div class="flex gap-4 mt-6 flex-wrap items-center">
    <button
      class="px-4 py-2 {hostActionClass} rounded-lg font-medium hover:opacity-90 ml-auto"
      onclick={onNext}
    >
      {hostActionLabel}
    </button>
  </div>
</div>
