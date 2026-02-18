<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  const quizzes = $page.data.quizzes ?? [];
</script>

<div class="min-h-screen p-6">
  <div class="max-w-2xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold text-pub-gold">Quiz Creator</h1>
      <a href="/" class="text-pub-muted hover:text-white">Back to home</a>
    </div>

    <div class="mb-6">
      <a
        href="/creator/new"
        class="inline-flex items-center gap-2 px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
      >
        + Create new quiz
      </a>
    </div>

    <div class="bg-pub-darker rounded-lg p-6">
      <h2 class="text-lg font-semibold mb-4">Your quizzes</h2>
      {#if quizzes.length === 0}
        <p class="text-pub-muted">No quizzes yet. Create your first one!</p>
      {:else}
        <ul class="space-y-2">
          {#each quizzes as q}
            <li>
              <a
                href="/creator/{encodeURIComponent(q)}"
                class="block px-4 py-3 bg-pub-dark rounded-lg hover:bg-pub-accent/20"
              >
                {q}
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
