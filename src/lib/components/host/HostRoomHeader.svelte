<script lang="ts">
  export let quizName = 'Loading...';
  export let roomId: string;
  export let showEndButton = false;
  export let onEndQuiz: () => void;
</script>

<div class="mb-4 sm:mb-6">
  <p class="text-pub-gold text-lg sm:text-xl font-semibold mb-2 break-words">
    {quizName}
  </p>
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <h1 class="text-xl sm:text-2xl font-bold text-pub-gold break-all">Host: {roomId}</h1>
    <div class="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
      {#if showEndButton}
        <button
          type="button"
          class="px-4 py-2 bg-[#CF3030] rounded-lg font-medium hover:opacity-90"
          onclick={onEndQuiz}
        >
          End Quiz
        </button>
      {/if}
    </div>
  </div>
</div>
