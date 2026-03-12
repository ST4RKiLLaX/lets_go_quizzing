<script lang="ts">
  import { EMOJI_OPTIONS } from '$lib/player/emoji-options.js';

  export let roomId: string;
  export let joinPassword = '';
  export let name = '';
  export let emoji = '😀';

  /** Discriminated join state derived from page flags. */
  export let mode: 'joining' | 'password' | 'request' | 'waiting' | 'denied' | 'kicked' | 'error' =
    'joining';

  export let joinError = '';
  export let requestFormUnavailableEmojis: Set<string> = new Set();
  export let joiningRoom = false;

  /** For kicked mode: 'kicked' | 'banned' */
  export let kickedType: 'kicked' | 'banned' = 'kicked';

  export let onJoin: (password?: string, name?: string, emoji?: string) => void = () => {};
  export let onTryAgain: () => void = () => {};
</script>

<div class="bg-pub-darker rounded-lg p-6">
  <h2 class="text-xl font-bold mb-4">Join room {roomId}</h2>

  {#if mode === 'kicked'}
    <p class="text-sm text-red-400 mb-2">
      {kickedType === 'banned'
        ? 'You have been banned from this room.'
        : 'You were removed from the room.'}
    </p>
    <button
      type="button"
      class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
      disabled={joiningRoom}
      on:click={onTryAgain}
    >
      {joiningRoom ? 'Joining...' : 'Try again'}
    </button>

  {:else if mode === 'request'}
    <form
      class="space-y-3"
      on:submit|preventDefault={() => onJoin(joinPassword, name, emoji)}
    >
      <p class="text-sm text-pub-muted mb-2">Enter your name and emoji to request access</p>
      <div>
        <label for="request-name" class="block text-sm text-pub-muted mb-1">Your name</label>
        <input
          id="request-name"
          type="text"
          bind:value={name}
          placeholder="Enter your name"
          maxlength={50}
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        />
      </div>
      <div>
        <span class="block text-sm text-pub-muted mb-2">Pick an emoji</span>
        <div class="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-32 overflow-y-auto p-1" style="scrollbar-width: thin;">
          {#each EMOJI_OPTIONS as e}
            {@const isUnavailable = requestFormUnavailableEmojis.has(e)}
            <button
              type="button"
              class="relative h-10 w-full text-xl leading-none rounded flex items-center justify-center {isUnavailable ? 'bg-pub-dark opacity-45 cursor-not-allowed' : emoji === e ? 'bg-pub-accent ring-2 ring-pub-gold' : 'bg-pub-dark hover:bg-pub-darker'}"
              disabled={isUnavailable}
              on:click={() => { if (!isUnavailable) emoji = e; }}
            >
              {e}
              {#if isUnavailable}
                <span class="absolute inset-0 flex items-center justify-center text-base font-extrabold text-red-300 pointer-events-none">✕</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
      {#if joinError}
        <p class="text-sm text-red-400">{joinError}</p>
      {/if}
      <button
        type="submit"
        class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        disabled={joiningRoom || !name.trim()}
      >
        {joiningRoom ? 'Requesting...' : 'Request to join'}
      </button>
    </form>

  {:else if mode === 'waiting'}
    <p class="text-pub-muted mb-4">Waiting for host approval...</p>
    <p class="text-sm text-pub-muted">The host will approve or deny your request shortly.</p>

  {:else if mode === 'denied'}
    <p class="text-sm text-red-400 mb-2">{joinError || 'Host denied your request. Change your name or emoji to try again.'}</p>
    <form
      class="space-y-3"
      on:submit|preventDefault={() => onJoin(joinPassword, name, emoji)}
    >
      <div>
        <label for="denied-request-name" class="block text-sm text-pub-muted mb-1">Your name</label>
        <input
          id="denied-request-name"
          type="text"
          bind:value={name}
          placeholder="Enter your name"
          maxlength={50}
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        />
      </div>
      <div>
        <span class="block text-sm text-pub-muted mb-2">Pick an emoji</span>
        <div class="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-32 overflow-y-auto p-1" style="scrollbar-width: thin;">
          {#each EMOJI_OPTIONS as e}
            {@const isUnavailable = requestFormUnavailableEmojis.has(e)}
            <button
              type="button"
              class="relative h-10 w-full text-xl leading-none rounded flex items-center justify-center {isUnavailable ? 'bg-pub-dark opacity-45 cursor-not-allowed' : emoji === e ? 'bg-pub-accent ring-2 ring-pub-gold' : 'bg-pub-dark hover:bg-pub-darker'}"
              disabled={isUnavailable}
              on:click={() => { if (!isUnavailable) emoji = e; }}
            >
              {e}
              {#if isUnavailable}
                <span class="absolute inset-0 flex items-center justify-center text-base font-extrabold text-red-300 pointer-events-none">✕</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
      <div class="flex gap-2">
        <button
          type="submit"
          class="px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          disabled={joiningRoom || !name.trim()}
        >
          {joiningRoom ? 'Requesting...' : 'Try again'}
        </button>
        <a href="/" class="px-6 py-3 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90">
          Leave
        </a>
      </div>
    </form>

  {:else if mode === 'password'}
    <form
      class="space-y-3"
      on:submit|preventDefault={() => onJoin(joinPassword)}
    >
      <label for="join-password" class="block text-sm text-pub-muted">
        This room requires a password
      </label>
      <input
        id="join-password"
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
        {joiningRoom ? 'Joining...' : 'Join Room'}
      </button>
    </form>

  {:else if mode === 'error'}
    {#if joinError === 'That player is already in the room'}
      <p class="text-sm text-red-400 mb-2">{joinError}</p>
      <p class="text-pub-muted text-sm">Open this room in a different browser or incognito window to join as another player.</p>
    {:else}
      <p class="text-sm text-red-400 mb-2">{joinError}</p>
      <a href="/" class="inline-block px-6 py-3 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90">
        Back to home
      </a>
    {/if}

  {:else}
    <p class="text-pub-muted">Joining room...</p>
  {/if}
</div>
