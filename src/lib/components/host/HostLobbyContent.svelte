<script lang="ts">
  import type { SerializedState } from '$lib/types/game.js';

  export let roomId: string;
  export let copied = false;
  export let state: SerializedState;
  export let prizeFeatureEnabled = false;
  export let onCopyJoinUrl: () => void;
  export let onStartGame: () => void;
  export let onOpenPrizeConfig: () => void;
</script>

<div class="bg-pub-darker rounded-lg p-4 sm:p-6">
  <h2 class="text-lg font-semibold mb-4">Waiting for players</h2>
  <div class="flex flex-wrap items-center gap-3 mb-4">
    <p class="text-pub-muted">
      Share this code: <span class="text-pub-gold font-mono text-lg sm:text-xl">{roomId}</span>
    </p>
  </div>
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <p class="text-pub-muted">
      Players join at: <span class="text-sm break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/play/{roomId}</span>
    </p>
    <button
      type="button"
      class="px-3 py-1.5 text-sm bg-pub-dark hover:bg-pub-accent/30 rounded-lg font-medium text-pub-gold shrink-0"
      onclick={onCopyJoinUrl}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  </div>
  <div class="flex flex-wrap gap-3 sm:gap-4">
    <button
      class="px-5 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
      onclick={onStartGame}
    >
      Start Game
    </button>
  </div>
  {#if prizeFeatureEnabled}
    <div class="mt-6 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="px-4 py-2 bg-pub-dark border border-pub-muted rounded-lg font-medium text-pub-gold hover:bg-pub-accent/20"
        onclick={onOpenPrizeConfig}
      >
        Room Prizes
      </button>
      {#if state?.roomPrizeConfig?.enabled}
        <span class="text-sm text-pub-muted">
          {state.roomPrizeConfig.tiers.length} tier{state.roomPrizeConfig.tiers.length === 1 ? '' : 's'} configured
        </span>
      {:else}
        <span class="text-sm text-pub-muted">No room prize tiers configured.</span>
      {/if}
    </div>
  {/if}
</div>
