<script lang="ts">
  import type { SerializedState } from '$lib/types/game.js';

  export let state: SerializedState;
  export let kickError: string;
  export let onKick: (playerId: string, ban?: boolean) => void;
  export let onApprove: (playerId: string) => void;
  export let onDeny: (playerId: string) => void;
  export let onApproveAll: () => void;
</script>

<div class="w-full lg:w-64 flex-shrink-0">
  <div class="bg-pub-darker rounded-lg p-4 lg:sticky lg:top-6">
    {#if (state.pendingPlayers ?? []).length > 0}
      <div class="mb-4 pb-4 border-b border-pub-muted">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h3 class="text-sm font-semibold text-pub-muted">Waiting for approval</h3>
          <button
            type="button"
            class="px-2 py-0.5 text-xs bg-green-600/80 hover:bg-green-600 rounded"
            on:click={onApproveAll}
            title="Admit all"
          >
            Admit all
          </button>
        </div>
        <ul class="space-y-2 text-sm">
          {#each state.pendingPlayers ?? [] as p}
            <li class="flex items-center gap-2 group">
              <span>{p.emoji}</span>
              <span class="truncate flex-1">{p.name}</span>
              <div class="flex gap-1">
                <button
                  type="button"
                  class="px-2 py-0.5 text-xs bg-green-600/80 hover:bg-green-600 rounded"
                  on:click={() => onApprove(p.playerId)}
                  title="Approve"
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="px-2 py-0.5 text-xs bg-pub-dark border border-pub-muted rounded hover:border-red-500 hover:text-red-400"
                  on:click={() => onDeny(p.playerId)}
                  title="Deny"
                >
                  Deny
                </button>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    <div class="flex items-center justify-between gap-2 mb-3">
      <h3 class="text-sm font-semibold text-pub-muted">Players</h3>
      <span class="text-sm text-pub-muted">{(state.players ?? []).length} active</span>
    </div>
    {#if kickError}
      <p class="text-sm text-red-400 mb-2">{kickError}</p>
    {/if}
    <ol class="space-y-2 text-sm">
      {#each (state.players ?? []).sort((a, b) => b.score - a.score) as player, i}
        <li class="flex items-center gap-2 group">
          <span class="text-pub-gold font-bold w-6">#{i + 1}</span>
          <span>{player.emoji}</span>
          <span class="truncate flex-1">{player.name}</span>
          <span class="font-bold">{player.score}</span>
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              class="px-2 py-0.5 text-xs bg-pub-dark border border-pub-muted rounded hover:border-red-500 hover:text-red-400"
              on:click={() => onKick(player.id)}
              title="Kick from room"
            >
              Kick
            </button>
            <button
              type="button"
              class="px-2 py-0.5 text-xs text-pub-muted border border-pub-muted rounded hover:border-red-500 hover:text-red-400"
              on:click={() => onKick(player.id, true)}
              title="Kick and ban from room"
            >
              Kick & ban
            </button>
          </div>
        </li>
      {/each}
    </ol>
    {#if (state.players ?? []).length === 0}
      <p class="text-pub-muted text-sm">No players yet</p>
    {/if}
  </div>
</div>
