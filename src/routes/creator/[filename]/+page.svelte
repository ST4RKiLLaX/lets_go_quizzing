<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import QuizEditor from '$lib/components/QuizEditor.svelte';
  import { createEmptyQuiz } from '$lib/types/quiz.js';
  import { toast } from '$lib/stores/toasts.js';
  import type { Quiz } from '$lib/types/quiz.js';

  const filename = $page.params.filename;
  const quizData = $page.data.quiz as Quiz | null;

  let quiz: Quiz = createEmptyQuiz();
  $: if (quizData) quiz = quizData;

  async function handleSave(q: Quiz) {
    if (!filename) throw new Error('Missing quiz filename');
    const res = await fetch(`/api/quizzes/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to save');
    toast.success(`Quiz "${q.meta?.name || filename}" saved.`);
  }
</script>

<div class="min-h-full p-6">
  <div class="max-w-3xl mx-auto">
    {#if quizData}
      <QuizEditor
        bind:quiz
        onSave={handleSave}
        quizFilename={filename}
        stickyToolbar
        stickyTitle={`Edit: ${filename}`}
        onCancel={() => goto('/creator')}
      />
    {:else}
      <p class="text-pub-muted">Loading...</p>
    {/if}
  </div>
</div>
