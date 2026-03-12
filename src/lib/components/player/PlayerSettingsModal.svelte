<script lang="ts">
  export let open = false;
  export let draftName = '';
  export let draftEmoji = '😀';
  export let registerError = '';
  export let unavailableEmojis: Set<string> = new Set();
  export let emojiOptions: string[] = [];
  export let onClose: () => void = () => {};
  export let onSave: () => void = () => {};
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5 max-h-[90vh] overflow-y-auto">
      <h2 id="settings-modal-title" class="text-lg font-semibold text-pub-gold mb-4">Change name and emoji</h2>
      <form class="space-y-4" onsubmit={(e) => { e.preventDefault(); onSave(); }}>
        <div>
          <label for="settings-name" class="block text-sm text-pub-muted mb-1">Your name</label>
          <input
            id="settings-name"
            type="text"
            bind:value={draftName}
            placeholder="Enter your name"
            maxlength={50}
            class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
          />
          <p class="mt-1 text-sm text-pub-muted">{draftName.length}/50 characters</p>
        </div>
        <div>
          <span class="block text-sm text-pub-muted mb-2">Pick an emoji</span>
          <div class="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-44 overflow-y-auto p-1" style="scrollbar-width: thin;">
            {#each emojiOptions as e}
              {@const isUnavailable = unavailableEmojis.has(e)}
              <button
                type="button"
                class="relative h-12 w-full text-2xl leading-none rounded flex items-center justify-center {isUnavailable ? 'bg-pub-dark opacity-45 cursor-not-allowed' : draftEmoji === e ? 'bg-pub-accent ring-2 ring-pub-gold' : 'bg-pub-dark hover:bg-pub-darker'}"
                disabled={isUnavailable}
                onclick={() => { if (!isUnavailable) draftEmoji = e; }}
              >
                {e}
                {#if isUnavailable}
                  <span class="absolute inset-0 flex items-center justify-center text-base font-extrabold text-red-300 pointer-events-none">✕</span>
                {/if}
              </button>
            {/each}
          </div>
          {#if registerError}
            <p class="mt-2 text-sm text-red-400">{registerError}</p>
          {/if}
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
            onclick={() => { onClose(); }}
          >
            Cancel
          </button>
          <button type="submit" class="px-4 py-2 bg-green-600 rounded-lg font-medium hover:opacity-90">
            Save
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
