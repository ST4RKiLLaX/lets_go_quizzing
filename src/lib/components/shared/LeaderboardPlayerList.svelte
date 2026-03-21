<script lang="ts">
  import type { SerializedPlayer } from '$lib/types/game.js';

  /** Pre-sorted (e.g. via sortPlayersByScore). */
  export let players: SerializedPlayer[];
</script>

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
