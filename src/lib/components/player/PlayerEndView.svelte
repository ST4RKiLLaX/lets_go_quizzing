<script lang="ts">
  import type { SerializedPlayer } from '$lib/types/game.js';

  export let title: string;
  export let isEnd: boolean;
  export let players: SerializedPlayer[] = [];
</script>

<div class="bg-pub-darker rounded-lg p-6">
  <h2 class="text-xl font-bold mb-2">{title}</h2>
  {#if isEnd}
    <p class="text-pub-muted mb-6">The host ended this quiz session.</p>
  {/if}
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
</div>
