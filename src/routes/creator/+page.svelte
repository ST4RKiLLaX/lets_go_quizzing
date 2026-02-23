<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';

  let quizzes: string[] = [];
  $: quizzes = $page.data.quizzes ?? [];

  let importInput: HTMLInputElement | null = null;
  let busy = false;
  let message = '';
  let error = '';

  async function onImportSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.set('file', file);
    busy = true;
    message = '';
    error = '';
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
      message = `Imported ${data.filename} (${imported} images, ${skipped} skipped).`;
      await invalidateAll();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      input.value = '';
    }
  }

  function downloadQuiz(filename: string) {
    window.location.href = `/api/quizzes/${encodeURIComponent(filename)}/export`;
  }

  async function deleteQuiz(filename: string) {
    if (!confirm(`Delete ${filename}? This also removes associated images.`)) return;
    busy = true;
    message = '';
    error = '';
    try {
      const res = await fetch(`/api/quizzes/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      message = `Deleted ${filename}.`;
      await invalidateAll();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="min-h-screen p-6">
  <div class="max-w-2xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold text-pub-gold">Quiz Creator</h1>
      <a href="/" class="text-pub-muted hover:text-white">Back to home</a>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-3">
      <a
        href="/creator/new"
        class="inline-flex items-center gap-2 px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
      >
        + Create new quiz
      </a>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 bg-pub-dark border border-pub-muted rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        disabled={busy}
        on:click={() => importInput?.click()}
      >
        Import ZIP
      </button>
      <input
        bind:this={importInput}
        type="file"
        accept=".zip,application/zip"
        class="hidden"
        on:change={onImportSelected}
      />
    </div>
    {#if message}
      <p class="text-sm text-green-400 mb-4">{message}</p>
    {/if}
    {#if error}
      <p class="text-sm text-red-400 mb-4">{error}</p>
    {/if}

    <div class="bg-pub-darker rounded-lg p-6">
      <h2 class="text-lg font-semibold mb-4">Your quizzes</h2>
      {#if quizzes.length === 0}
        <p class="text-pub-muted">No quizzes yet. Create your first one!</p>
      {:else}
        <ul class="space-y-2">
          {#each quizzes as q}
            <li class="px-4 py-3 bg-pub-dark rounded-lg">
              <div class="flex flex-wrap items-center gap-2">
                <a
                  href="/creator/{encodeURIComponent(q)}"
                  class="font-medium hover:text-pub-gold break-all min-w-0 flex-1"
                >
                  {q}
                </a>
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm rounded bg-pub-accent hover:opacity-90 disabled:opacity-50"
                  disabled={busy}
                  on:click={() => downloadQuiz(q)}
                >
                  Export
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm rounded bg-red-700 hover:opacity-90 disabled:opacity-50"
                  disabled={busy}
                  on:click={() => deleteQuiz(q)}
                >
                  Delete
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
