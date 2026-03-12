<script lang="ts">
  export let roomId: string;
  export let needsRoomPassword: boolean;
  export let joinError: string;
  export let joinPassword: string;
  export let joiningRoom: boolean;
  export let onJoin: (password: string) => void;
</script>

<div class="bg-pub-darker rounded-lg p-6">
  <h2 class="text-xl font-bold mb-4">Projector – Room {roomId}</h2>
  {#if needsRoomPassword}
    <form
      class="space-y-3"
      onsubmit={(e) => { e.preventDefault(); onJoin(joinPassword); }}
    >
      <label for="projector-join-password" class="block text-sm text-pub-muted">
        This room requires a password
      </label>
      <input
        id="projector-join-password"
        type="password"
        bind:value={joinPassword}
        placeholder="Enter room password"
        class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
      />
      {#if joinError === 'Invalid room password'}
        <p class="text-sm text-red-400">Invalid room password. Please try again.</p>
      {/if}
      <button
        type="submit"
        class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        disabled={joiningRoom || !joinPassword.trim()}
      >
        {joiningRoom ? 'Joining...' : 'Join'}
      </button>
    </form>
  {:else}
    <p class="text-pub-muted">Joining room...</p>
  {/if}
</div>
