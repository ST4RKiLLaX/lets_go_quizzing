<script lang="ts">
  import EmojiCategoryPicker from './EmojiCategoryPicker.svelte';

  export let open = false;
  export let draftName = '';
  export let draftEmoji = '😀';
  export let registerError = '';
  export let unavailableEmojis: Set<string> = new Set();
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
          <EmojiCategoryPicker
            selected={draftEmoji}
            unavailable={unavailableEmojis}
            density="comfortable"
            scrollClass="max-h-56"
            onPick={(e) => { draftEmoji = e; }}
          />
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
