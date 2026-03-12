<script lang="ts">
  import { EMOJI_OPTIONS } from '$lib/player/emoji-options.js';

  export let name = '';
  export let emoji = '😀';
  export let unavailableEmojis: Set<string> = new Set();
  export let registerError = '';
  export let onRegister: () => void = () => {};
</script>

<div class="bg-pub-darker rounded-lg p-6">
  <h2 class="text-xl font-bold mb-4">Join the quiz</h2>
  <form class="space-y-4" on:submit|preventDefault={onRegister}>
    <div>
      <label for="player-name" class="block text-sm text-pub-muted mb-1">Your name</label>
      <input
        id="player-name"
        type="text"
        bind:value={name}
        placeholder="Enter your name"
        maxlength={50}
        class="w-full bg-pub-dark border rounded-lg px-4 py-2 {name.length >= 50 ? 'border-amber-500' : 'border-pub-muted'}"
      />
      <p class="mt-1 text-sm {name.length >= 50 ? 'text-amber-500' : 'text-pub-muted'}">
        {name.length}/50 characters
        {#if name.length >= 50}
          <span class="font-medium"> — at limit</span>
        {/if}
      </p>
    </div>
    <div>
      <span class="block text-sm text-pub-muted mb-2">Pick an emoji</span>
      <div
        class="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-44 overflow-y-auto overflow-x-hidden p-1"
        role="group"
        aria-label="Pick an emoji"
        style="scrollbar-width: thin;"
      >
        {#each EMOJI_OPTIONS as e}
          {@const isUnavailable = unavailableEmojis.has(e)}
          <button
            type="button"
            class="relative h-12 w-full text-2xl leading-none rounded flex items-center justify-center {isUnavailable ? 'bg-pub-dark opacity-45 cursor-not-allowed' : emoji === e ? 'bg-pub-accent ring-2 ring-pub-gold' : 'bg-pub-dark hover:bg-pub-darker'}"
            disabled={isUnavailable}
            on:click={() => {
              if (!isUnavailable) emoji = e;
            }}
          >
            {e}
            {#if isUnavailable}
              <span class="absolute inset-0 flex items-center justify-center text-base font-extrabold text-red-300 pointer-events-none">
                ✕
              </span>
            {/if}
          </button>
        {/each}
      </div>
      {#if registerError}
        <p class="mt-2 text-sm text-red-400">{registerError}</p>
      {/if}
    </div>
    <button
      type="submit"
      class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90"
    >
      Join
    </button>
  </form>
</div>
