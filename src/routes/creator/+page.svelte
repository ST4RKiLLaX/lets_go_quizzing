<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import CreatorDeleteQuizModal from '$lib/components/creator/CreatorDeleteQuizModal.svelte';
  import { toast } from '$lib/stores/toasts.js';
  import type { QuizListItem } from '$lib/types/quiz-list.js';

  $: quizzes = ($page.data.quizzes ?? []) as QuizListItem[];

  let importInput: HTMLInputElement | null = null;
  let busy = false;

  async function onImportSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.set('file', file);
    busy = true;
    try {
      const res = await fetch('/api/quizzes/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      const imported = Array.isArray(data.importedImages) ? data.importedImages.length : 0;
      const skipped = Array.isArray(data.skippedImages) ? data.skippedImages.length : 0;
      toast.success(`Imported ${data.filename} (${imported} images, ${skipped} skipped).`);
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
      input.value = '';
    }
  }

  function downloadQuiz(quiz: QuizListItem) {
    closeQuizMenu();
    window.location.href = `/api/quizzes/${encodeURIComponent(quiz.filename)}/export`;
  }

  let quizPendingDelete: QuizListItem | null = null;

  function openDeleteModal(quiz: QuizListItem) {
    quizPendingDelete = quiz;
    openMenuFilename = null;
  }

  function closeDeleteModal() {
    quizPendingDelete = null;
  }

  async function confirmDeleteQuiz() {
    const quiz = quizPendingDelete;
    if (!quiz) return;
    const filename = quiz.filename;
    busy = true;
    quizPendingDelete = null;
    try {
      const res = await fetch(`/api/quizzes/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      toast.success(`Deleted ${filename}.`);
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  let openMenuFilename: string | null = null;

  function toggleQuizMenu(filename: string) {
    openMenuFilename = openMenuFilename === filename ? null : filename;
  }

  /** Pass the click event from window; omit when forcing close (e.g. after export). */
  function closeQuizMenu(event?: Event) {
    if (event) {
      const t = event.target;
      if (t instanceof HTMLElement && t.closest('[data-quiz-list-actions]')) return;
    }
    openMenuFilename = null;
  }
</script>

<svelte:window on:click={closeQuizMenu} />

<div class="min-h-full p-6">
  <div class="max-w-2xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold text-pub-gold">Quiz Creator</h1>
      <a href="/" class="text-pub-muted hover:text-white">Back to home</a>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-3">
      <a
        href="/creator/new"
        class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pub-accent text-white font-medium hover:opacity-90"
        title="Create new quiz"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>Create new quiz</span>
      </a>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pub-dark border border-pub-muted font-medium text-sky-400 hover:bg-pub-darker hover:text-sky-300 disabled:opacity-50"
        disabled={busy}
        title="Import quiz from ZIP"
        on:click={() => importInput?.click()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>Import ZIP</span>
      </button>
      <input
        bind:this={importInput}
        type="file"
        accept=".zip,application/zip"
        class="hidden"
        on:change={onImportSelected}
      />
    </div>
    <div class="bg-pub-darker rounded-lg p-6">
      <h2 class="text-lg font-semibold mb-4">Your quizzes</h2>
      {#if quizzes.length === 0}
        <p class="text-pub-muted">No quizzes yet. Create your first one!</p>
      {:else}
        <ul class="space-y-2">
          {#each quizzes as quiz}
            <li class="px-4 py-3 bg-pub-dark rounded-lg">
              <div class="flex flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1 break-all">
                  <p class="font-medium text-pub-gold">{quiz.title}</p>
                  <p class="text-xs text-pub-muted mt-0.5">{quiz.filename}</p>
                </div>
                <div
                  class="flex items-center gap-1 shrink-0"
                  role="group"
                  aria-label="Quiz actions for {quiz.title}"
                  data-quiz-list-actions
                >
                  <a
                    href="/creator/{encodeURIComponent(quiz.filename)}"
                    class="inline-flex items-center justify-center p-2 rounded-lg text-amber-400 hover:bg-pub-darker hover:text-amber-300"
                    title="Edit quiz"
                    aria-label="Edit {quiz.title}"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </a>
                  <a
                    href="/?host=1&quiz={encodeURIComponent(quiz.filename)}"
                    class="inline-flex items-center justify-center p-2 rounded-lg text-sky-400 hover:bg-pub-darker hover:text-sky-300"
                    title="Host this quiz (create room)"
                    aria-label="Host {quiz.title}"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                      <polyline points="17 2 12 7 7 2" />
                    </svg>
                  </a>
                  <button
                    type="button"
                    class="inline-flex items-center justify-center p-2 rounded-lg text-emerald-400 hover:bg-pub-darker hover:text-emerald-300 disabled:opacity-50"
                    disabled={busy}
                    title="Export quiz"
                    aria-label="Export {quiz.title}"
                    on:click={() => downloadQuiz(quiz)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <div class="relative">
                    <button
                      type="button"
                      class="inline-flex items-center justify-center p-2 rounded-lg text-violet-400 hover:bg-pub-darker hover:text-violet-300 disabled:opacity-50"
                      disabled={busy}
                      title="More actions"
                      aria-label="More actions for {quiz.title}"
                      aria-expanded={openMenuFilename === quiz.filename}
                      aria-haspopup="true"
                      on:click|stopPropagation={() => toggleQuizMenu(quiz.filename)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </svg>
                    </button>
                    {#if openMenuFilename === quiz.filename}
                      <div
                        class="absolute right-0 top-full mt-1 z-20 min-w-[11rem] py-1 rounded-lg border border-pub-muted bg-pub-darker shadow-lg"
                        role="menu"
                      >
                        <button
                          type="button"
                          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                          role="menuitem"
                          disabled={busy}
                          on:click|stopPropagation={() => openDeleteModal(quiz)}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="shrink-0"
                            aria-hidden="true"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                          Delete quiz
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<CreatorDeleteQuizModal
  quiz={quizPendingDelete}
  onClose={closeDeleteModal}
  onConfirm={confirmDeleteQuiz}
/>
