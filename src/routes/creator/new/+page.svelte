<script lang="ts">
  import { goto } from '$app/navigation';
  import QuizEditor from '$lib/components/QuizEditor.svelte';
  import { createEmptyQuiz } from '$lib/types/quiz.js';
  import { toast } from '$lib/stores/toasts.js';
  let quiz = createEmptyQuiz();

  async function handleSave(q: typeof quiz) {
    const res = await fetch('/api/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiz: q }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to save');
    toast.success(`Quiz "${q.meta?.name || data.filename}" created.`);
    goto(`/creator/${encodeURIComponent(data.filename)}`);
  }
</script>

<div class="min-h-full p-6">
  <div class="max-w-3xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold text-pub-gold">Create new quiz</h1>
      <a href="/creator" class="text-pub-muted hover:text-white">← Back</a>
    </div>
    <QuizEditor bind:quiz onSave={handleSave} saveLabel="Create quiz" />
  </div>
</div>
