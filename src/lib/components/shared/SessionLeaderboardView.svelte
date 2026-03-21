<script lang="ts">
  import type { SerializedPlayer } from '$lib/types/game.js';
  import LeaderboardPlayerList from './LeaderboardPlayerList.svelte';

  export let title: string;
  export let isEnd: boolean;
  export let players: SerializedPlayer[] = [];
</script>

<div class="bg-pub-darker rounded-lg p-6">
  <h2 class="text-xl font-bold mb-2">{title}</h2>
  {#if isEnd}
    <p class="text-pub-muted mb-6">The host ended this quiz session.</p>
  {/if}
  <LeaderboardPlayerList {players} />
</div>
