<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import QuizEditor from '$lib/components/QuizEditor.svelte';
  import { createEmptyQuiz } from '$lib/types/quiz.js';
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
  }
</script>

<div class="min-h-screen p-6">
  <div class="max-w-3xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold text-pub-gold">Edit: {filename}</h1>
      <p class="flex gap-4">
        <a href="/creator" class="text-pub-muted hover:text-white">← Back</a>
        <a href="/" class="text-pub-muted hover:text-white">Home</a>
      </p>
    </div>
    {#if quizData}
      <QuizEditor bind:quiz onSave={handleSave} quizFilename={filename} />
    {:else}
      <p class="text-pub-muted">Loading...</p>
    {/if}
  </div>
</div>
