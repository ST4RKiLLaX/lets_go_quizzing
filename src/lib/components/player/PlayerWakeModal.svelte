<script lang="ts">
  export let open = false;
  export let onClose: () => void = () => {};
  export let onEnable: () => void = () => {};
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 class="text-lg font-semibold text-pub-gold mb-3">Keep your screen awake?</h2>
      <p class="text-sm text-pub-muted mb-5">
        We could not enable screen wake automatically. Tap below to keep your screen on during the
        quiz.
      </p>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          onclick={onClose}
        >
          Not now
        </button>
        <button
          type="button"
          class="px-4 py-2 bg-green-600 rounded-lg font-medium hover:opacity-90"
          onclick={onEnable}
        >
          Enable
        </button>
      </div>
    </div>
  </div>
{/if}
