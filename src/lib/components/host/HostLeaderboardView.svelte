<script lang="ts">
  import type { SerializedPlayer } from '$lib/types/game.js';

  export let title: string;
  export let isEnd: boolean;
  export let players: SerializedPlayer[] = [];
  export let roomId: string;
  export let onNext: (() => void) | undefined = undefined;
  export let nextLabel: string | undefined = undefined;
  export let showProjectorButton = true;
</script>

<div class="bg-pub-darker rounded-lg p-4 sm:p-6">
  <h2 class="text-xl font-bold mb-6 {isEnd ? 'text-2xl text-pub-gold' : ''}">{title}</h2>
  <ol class="space-y-3">
    {#each players as player, i}
      <li class="flex items-center gap-4">
        <span class="text-pub-gold font-bold w-8">#{i + 1}</span>
        <span>{player.emoji}</span>
        <span>{player.name}</span>
        <span class="ml-auto font-bold">{player.score}</span>
      </li>
    {/each}
  </ol>
  {#if isEnd}
    <div class="mt-6 flex gap-4 flex-wrap">
      <a
        href="/?host=1"
        class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
      >
        New Game
      </a>
      {#if showProjectorButton}
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          onclick={() => window.open(`/projector/${roomId}`, '_blank', 'width=1280,height=720')}
        >
          Projector
        </button>
      {/if}
      <a href="/" class="text-pub-accent hover:underline self-center">Back to home</a>
    </div>
  {:else}
    <div class="flex gap-4 mt-6 items-center">
      {#if showProjectorButton}
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          onclick={() => window.open(`/projector/${roomId}`, '_blank', 'width=1280,height=720')}
        >
          Projector
        </button>
      {/if}
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
