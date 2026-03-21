<script lang="ts">
  import type { SerializedState } from '$lib/types/game.js';

  export let state: SerializedState;
  export let questionId: string;
  export let visibilityPending: string | null;
  /** Third arg matches host page: pass `projectorHiddenByHost` as emitted visibility toggle */
  export let onToggleSubmissionVisibility: (
    playerId: string,
    questionId: string,
    visible: boolean
  ) => void;

  $: visibleSubs = (state.submissions ?? []).filter(
    (s) => s.questionId === questionId && s.visibility !== 'blocked'
  );
  $: blockedCount = (state.submissions ?? []).filter(
    (s) => s.questionId === questionId && s.visibility === 'blocked'
  ).length;
</script>

<div class="space-y-2 mt-4">
  <h3 class="text-sm font-semibold text-pub-muted">Responses:</h3>
  <ul class="space-y-1">
    {#each visibleSubs as sub}
      {@const player = state.players.find((p) => p.id === sub.playerId)}
      {@const isHidden = sub.projectorHiddenByHost === true}
      {@const pendingKey = `sub:${sub.playerId}:${sub.questionId}`}
      <li class="px-4 py-2 bg-pub-dark rounded text-sm flex items-center justify-between gap-2">
        <span
          ><span class="text-pub-muted mr-2">{player?.emoji} {player?.name}:</span>{sub.answerText}</span
        >
        <button
          type="button"
          class="px-2 py-1 text-xs rounded bg-pub-darker border border-pub-muted hover:bg-pub-muted/20 disabled:opacity-50"
          disabled={visibilityPending === pendingKey}
          onclick={() => onToggleSubmissionVisibility(sub.playerId, sub.questionId, isHidden)}
        >
          {isHidden ? 'Show' : 'Hide'}
        </button>
      </li>
    {/each}
  </ul>
  {#if blockedCount > 0}
    <p class="text-sm text-pub-muted italic">
      {blockedCount} blocked response{blockedCount === 1 ? '' : 's'}
    </p>
  {/if}
</div>
