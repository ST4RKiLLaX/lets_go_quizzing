<script lang="ts">
  import type { SerializedState } from '$lib/types/game.js';
  import { getWordCloudTokens } from '$lib/utils/word-cloud.js';

  export let state: SerializedState;
  export let questionId: string;
  export let visibilityPending: string | null;
  export let onToggleWordVisibility: (
    questionId: string,
    word: string,
    visible: boolean
  ) => void;

  $: visibleSubs = (state.submissions ?? []).filter(
    (s) => s.questionId === questionId && s.visibility !== 'blocked'
  );
  $: blockedCount = (state.submissions ?? []).filter(
    (s) => s.questionId === questionId && s.visibility === 'blocked'
  ).length;
  $: wordCounts = visibleSubs.reduce((acc, s) => {
    for (const token of getWordCloudTokens(s.answerText ?? '')) {
      acc.set(token, (acc.get(token) || 0) + 1);
    }
    return acc;
  }, new Map<string, number>());
  $: hiddenSet = new Set((state.hiddenWordsByQuestion ?? {})[questionId] ?? []);
</script>

<div class="mt-4 space-y-4">
  <div class="flex flex-wrap gap-3 justify-center items-center p-6 bg-pub-dark rounded min-h-[150px]">
    {#each Array.from(wordCounts).sort((a, b) => b[1] - a[1]) as [word, count]}
      {@const isHidden = hiddenSet.has(word)}
      {@const pendingKey = `word:${questionId}:${word}`}
      <div class="flex items-center gap-1">
        <span
          style="font-size: {Math.max(1, Math.min(3.5, 0.9 + count * 0.3))}rem; opacity: {Math.min(
            1,
            0.5 + count * 0.2
          )}"
          class="text-pub-gold font-bold leading-none inline-block"
        >
          {word} ({count})
        </span>
        <button
          type="button"
          class="px-2 py-0.5 text-xs rounded bg-pub-darker border border-pub-muted hover:bg-pub-muted/20 disabled:opacity-50"
          disabled={visibilityPending === pendingKey}
          onclick={() => onToggleWordVisibility(questionId, word, isHidden)}
        >
          {isHidden ? 'Show' : 'Hide'}
        </button>
      </div>
    {/each}
  </div>
  {#if blockedCount > 0}
    <p class="text-sm text-pub-muted italic">
      {blockedCount} blocked response{blockedCount === 1 ? '' : 's'}
    </p>
  {/if}
</div>
