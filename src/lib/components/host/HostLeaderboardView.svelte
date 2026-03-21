<script lang="ts">
  import type { SerializedPlayer } from '$lib/types/game.js';
  import LeaderboardPlayerList from '$lib/components/shared/LeaderboardPlayerList.svelte';

  export let title: string;
  export let isEnd: boolean;
  export let players: SerializedPlayer[] = [];
  export let onNext: (() => void) | undefined = undefined;
  export let nextLabel: string | undefined = undefined;
</script>

<div class="bg-pub-darker rounded-lg p-4 sm:p-6">
  <h2 class="text-xl font-bold mb-6 {isEnd ? 'text-2xl text-pub-gold' : ''}">{title}</h2>
  <LeaderboardPlayerList {players} />
  {#if isEnd}
    <div class="mt-6 flex gap-4 flex-wrap">
      <a
        href="/?host=1"
        class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
      >
        New Game
      </a>
      <a href="/" class="text-pub-accent hover:underline self-center">Back to home</a>
    </div>
  {:else}
    <div class="flex gap-4 mt-6 items-center">
      {#if onNext && nextLabel}
        <button
          class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 ml-auto"
          onclick={onNext}
        >
          {nextLabel}
        </button>
      {/if}
    </div>
  {/if}
</div>
