<script lang="ts">
  export let open = false;
  export let inLobby = false;
  export let leavingQuiz = false;
  export let onClose: () => void = () => {};
  export let onExit: () => void = () => {};
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="exit-modal-title">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 id="exit-modal-title" class="text-lg font-semibold text-pub-gold mb-3">Exit quiz?</h2>
      {#if inLobby}
        <p class="text-sm text-pub-muted mb-5">
          You will leave the room. You can rejoin anytime before the host starts the quiz. No score or progress will be affected.
        </p>
      {:else}
        <p class="text-sm text-pub-muted mb-5">
          You will be removed from the quiz and cannot rejoin this session. Your score will not count and you will not appear on the leaderboard.
        </p>
      {/if}
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
          class="px-4 py-2 bg-red-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          onclick={onExit}
          disabled={leavingQuiz}
        >
          {leavingQuiz ? 'Leaving...' : 'Exit quiz'}
        </button>
      </div>
    </div>
  </div>
{/if}
