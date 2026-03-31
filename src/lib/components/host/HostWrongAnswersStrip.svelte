<script lang="ts">
  import type { SerializedState } from '$lib/types/game.js';
  import type { Question } from '$lib/types/quiz.js';

  export let state: SerializedState;
  export let currentQuestion: Question | null;
  export let getDisplay: (wa: {
    playerId: string;
    questionId: string;
    answer: string | number | number[];
  }) => string;
  export let onOverride: (playerId: string, questionId: string, delta: number) => void;

  $: showStrip =
    state?.type === 'RevealAnswer' &&
    (currentQuestion?.type === 'input' ||
      currentQuestion?.type === 'true_false' ||
      currentQuestion?.type === 'multi_select' ||
      currentQuestion?.type === 'slider' ||
      currentQuestion?.type === 'reorder' ||
      currentQuestion?.type === 'click_to_match' ||
      currentQuestion?.type === 'drag_and_drop' ||
      currentQuestion?.type === 'hotspot') &&
    (state.wrongAnswers?.length ?? 0) > 0;
</script>

{#if showStrip}
  <div class="mt-6 pt-6 border-t border-pub-muted">
    <h3 class="text-sm font-semibold text-pub-muted mb-2">
      Wrong answers (Use + or − to adjust points)
    </h3>
    <div class="flex flex-wrap gap-2">
      {#each state.wrongAnswers ?? [] as wa}
        <div class="flex items-center gap-1 px-3 py-1 bg-pub-dark rounded text-sm">
          <span>{getDisplay(wa)}</span>
          <button
            type="button"
            class="w-6 h-6 flex items-center justify-center rounded bg-green-600/80 hover:bg-green-600 text-white text-xs font-bold"
            onclick={() => onOverride(wa.playerId, wa.questionId, 1)}
            title="Award point"
          >
            +
          </button>
          <button
            type="button"
            class="w-6 h-6 flex items-center justify-center rounded bg-red-900/80 hover:bg-red-900 text-white text-xs font-bold"
            onclick={() => onOverride(wa.playerId, wa.questionId, -1)}
            title="Remove point"
          >
            −
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}
