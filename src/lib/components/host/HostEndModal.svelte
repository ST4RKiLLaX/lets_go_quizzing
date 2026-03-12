<script lang="ts">
  export let open = false;
  export let onClose: () => void = () => {};
  export let onConfirm: () => void = () => {};
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 class="text-lg font-semibold text-pub-gold mb-3">End quiz now?</h2>
      <p class="text-sm text-pub-muted mb-5">
        If you end the quiz now, all players and the projector will immediately see that the quiz has ended.
        This room cannot continue from where it left off.
      </p>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          onclick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 bg-[#CF3030] rounded-lg font-medium hover:opacity-90"
          onclick={onConfirm}
        >
          End Quiz
        </button>
      </div>
    </div>
  </div>
{/if}
