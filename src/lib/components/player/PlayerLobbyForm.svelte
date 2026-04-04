<script lang="ts">
  import EmojiCategoryPicker from './EmojiCategoryPicker.svelte';

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
      <EmojiCategoryPicker
        selected={emoji}
        unavailable={unavailableEmojis}
        onPick={(e) => { emoji = e; }}
      />
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
