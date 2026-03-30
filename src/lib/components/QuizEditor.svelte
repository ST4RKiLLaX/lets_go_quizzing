<script lang="ts">
  import type { Quiz } from '$lib/types/quiz.js';
  import QuestionForm from '$lib/components/quiz-editor/QuestionForm.svelte';
  import {
    addRound as actAddRound,
    removeRound as actRemoveRound,
    addQuestion as actAddQuestion,
    removeQuestion as actRemoveQuestion,
    moveQuestion as actMoveQuestion,
    setQuestionType as actSetQuestionType,
    addOption as actAddOption,
    removeOption as actRemoveOption,
    toggleMultiSelectAnswer as actToggleMultiSelectAnswer,
    updateSliderQuestion as actUpdateSliderQuestion,
    addInputAnswer as actAddInputAnswer,
    removeInputAnswer as actRemoveInputAnswer,
    addMatchingItem as actAddMatchingItem,
    removeMatchingItem as actRemoveMatchingItem,
    addMatchingOption as actAddMatchingOption,
    removeMatchingOption as actRemoveMatchingOption,
    setMatchingAnswer as actSetMatchingAnswer,
    updateQuestionField as actUpdateQuestionField,
    updateQuestion as actUpdateQuestion,
    updateHotspotAnswer as actUpdateHotspotAnswer,
    setHotspotImageAspectRatio as actSetHotspotImageAspectRatio,
    clearImage as actClearImage,
  } from '$lib/components/quiz-editor/QuizEditorActions.js';
  import { quizToYaml, yamlToQuiz } from '$lib/utils/quiz-yaml.js';
  import { QUIZ_JSON_SCHEMA } from '$lib/schema/quiz-json-schema.js';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import type { ComponentType } from 'svelte';
  import { onMount } from 'svelte';

  let YamlEditorComponent: ComponentType | null = null;
  onMount(() => {
    import('$lib/components/YamlEditor.svelte').then((m) => (YamlEditorComponent = m.default));
  });

  const STORAGE_KEY = 'quiz-editor-mode';

  export let quiz: Quiz;
  export let onSave: (quiz: Quiz) => Promise<void>;
  export let saveLabel = 'Save';
  export let quizFilename: string | undefined = undefined;
  /** Sticky top bar with title + actions (used on per-quiz edit screen) */
  export let stickyToolbar = false;
  export let stickyTitle: string | undefined = undefined;
  export let onCancel: (() => void) | undefined = undefined;

  let mode: 'form' | 'yaml' =
    (typeof window !== 'undefined' && (localStorage.getItem(STORAGE_KEY) as 'form' | 'yaml' | null) === 'yaml')
      ? 'yaml'
      : 'form';
  let yamlStr = '';
  $: if (mode === 'yaml' && quiz) yamlStr = quizToYaml(quiz);
  let saving = false;
  /** Tracks in-flight image import/upload by stable question id (indices can change if user reorders). */
  let imageActionPending: { questionId: string; mode: 'upload' | 'import' } | null = null;
  let imageImportUrlDrafts: Record<string, string> = {};
  let error = '';
  let questionPendingRemove: { ri: number; qi: number } | null = null;
  /** Question id that was reordered (for brief highlight + clearer UX) */
  let reorderHighlightId: string | null = null;
  let reorderHighlightTimer: ReturnType<typeof setTimeout> | null = null;

  function switchToYaml() {
    error = '';
    yamlStr = quizToYaml(quiz);
    mode = 'yaml';
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, 'yaml');
  }

  function switchToForm() {
    error = '';
    try {
      quiz = yamlToQuiz(yamlStr);
      mode = 'form';
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, 'form');
    } catch (e) {
      error = String(e);
    }
  }

  function addRound() {
    quiz = actAddRound(quiz);
  }

  function removeRound(ri: number) {
    quiz = actRemoveRound(quiz, ri);
  }

  function addQuestion(ri: number) {
    quiz = actAddQuestion(quiz, ri);
  }

  function openRemoveQuestionModal(ri: number, qi: number) {
    questionPendingRemove = { ri, qi };
  }

  function closeRemoveQuestionModal() {
    questionPendingRemove = null;
  }

  function confirmRemoveQuestion() {
    if (!questionPendingRemove) return;
    const { ri, qi } = questionPendingRemove;
    quiz = actRemoveQuestion(quiz, ri, qi);
    questionPendingRemove = null;
  }

  function moveQuestionInRound(ri: number, qi: number, delta: -1 | 1) {
    const movedId = quiz.rounds[ri].questions[qi]?.id;
    quiz = actMoveQuestion(quiz, ri, qi, delta);
    if (movedId) {
      reorderHighlightId = movedId;
      if (reorderHighlightTimer) clearTimeout(reorderHighlightTimer);
      reorderHighlightTimer = setTimeout(() => {
        reorderHighlightId = null;
        reorderHighlightTimer = null;
      }, 900);
    }
  }

  function setQuestionType(
    ri: number,
    qi: number,
    type: 'choice' | 'true_false' | 'poll' | 'multi_select' | 'slider' | 'input' | 'open_ended' | 'word_cloud' | 'reorder' | 'matching' | 'hotspot'
  ) {
    quiz = actSetQuestionType(quiz, ri, qi, type);
  }

  async function handleSave() {
    error = '';
    saving = true;
    try {
      const toSave = mode === 'form' ? quiz : yamlToQuiz(yamlStr);
      await onSave(toSave);
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }

  function findQuestionSlotByQuestionId(q: Quiz, questionId: string): { ri: number; qi: number } | null {
    for (let ri = 0; ri < q.rounds.length; ri++) {
      const questions = q.rounds[ri].questions;
      for (let qi = 0; qi < questions.length; qi++) {
        if (questions[qi].id === questionId) return { ri, qi };
      }
    }
    return null;
  }

  function updateQuestionImage(questionId: string, filename: string) {
    const slot = findQuestionSlotByQuestionId(quiz, questionId);
    if (!slot) throw new Error('Question was removed during image update');
    quiz = actUpdateQuestionField(quiz, slot.ri, slot.qi, { image: filename });
  }

  async function parseImageActionResponse(res: Response, actionLabel: 'Upload' | 'Import') {
    const raw = await res.text();
    let data: { error?: string; filename?: string };
    try {
      data = JSON.parse(raw) as { error?: string; filename?: string };
    } catch {
      throw new Error(
        res.ok ? 'Invalid server response' : `${actionLabel} failed (${res.status}): ${raw.slice(0, 120)}`
      );
    }
    if (!res.ok) throw new Error(data.error ?? `${actionLabel} failed (${res.status})`);
    if (!data.filename) throw new Error(`${actionLabel} succeeded but no filename returned`);
    return data.filename;
  }

  function setImageImportUrlDraft(questionId: string, value: string) {
    imageImportUrlDrafts = { ...imageImportUrlDrafts, [questionId]: value };
  }

  function clearImageImportUrlDraft(questionId: string) {
    if (!(questionId in imageImportUrlDrafts)) return;
    const nextDrafts = { ...imageImportUrlDrafts };
    delete nextDrafts[questionId];
    imageImportUrlDrafts = nextDrafts;
  }

  async function handleImageUploadForQuestion(questionId: string, file: File) {
    if (!quizFilename?.trim()) {
      error =
        'Cannot upload: open this quiz from the creator list so it has a saved file name (new quizzes need “Create quiz” first).';
      return;
    }
    if (!questionId?.trim()) {
      error = 'Cannot upload: question ID is missing. Try reloading the page.';
      return;
    }
    imageActionPending = { questionId, mode: 'upload' };
    error = '';
    try {
      const formData = new FormData();
      formData.append('quizFilename', quizFilename);
      formData.append('questionId', questionId);
      formData.append('file', file);
      const res = await fetch('/api/quizzes/images', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const filename = await parseImageActionResponse(res, 'Upload');
      updateQuestionImage(questionId, filename);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      imageActionPending = null;
    }
  }

  async function handleImageImportForQuestion(questionId: string, url: string) {
    if (!quizFilename?.trim()) {
      error =
        'Cannot import: open this quiz from the creator list so it has a saved file name (new quizzes need “Create quiz” first).';
      return;
    }
    if (!questionId?.trim()) {
      error = 'Cannot import: question ID is missing. Try reloading the page.';
      return;
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      error = 'Cannot import: image URL is required.';
      return;
    }
    imageActionPending = { questionId, mode: 'import' };
    error = '';
    try {
      const res = await fetch('/api/quizzes/images/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizFilename, questionId, url: trimmedUrl }),
        credentials: 'include',
      });
      const filename = await parseImageActionResponse(res, 'Import');
      updateQuestionImage(questionId, filename);
      clearImageImportUrlDraft(questionId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      imageActionPending = null;
    }
  }

  function clearImage(ri: number, qi: number) {
    quiz = actClearImage(quiz, ri, qi);
  }

  $: saveDisabled = saving || (mode === 'form' && !quiz.meta.name.trim());
</script>

<div class={stickyToolbar ? 'px-4 sm:px-6 md:px-8' : ''}>
  {#if stickyToolbar}
    <header
      class="sticky top-0 z-40 mb-6 flex flex-col gap-2 border-b border-pub-muted bg-pub-darker pt-3 pb-4 sm:pt-3.5 sm:pb-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-3 gap-y-2">
        {#if stickyTitle}
          <h1 class="text-xl sm:text-2xl font-bold text-pub-gold min-w-0 truncate">{stickyTitle}</h1>
        {:else}
          <span class="min-w-0 flex-1"></span>
        {/if}
        <div class="flex items-center gap-2 shrink-0">
          {#if onCancel}
            <button
              type="button"
              class="px-4 py-2 text-sm rounded-lg border border-pub-muted bg-pub-dark text-pub-muted hover:text-white hover:border-pub-gold/50"
              on:click={onCancel}
            >
              Cancel
            </button>
          {/if}
          <button
            type="button"
            class="px-6 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-sm sm:text-base"
            on:click={handleSave}
            disabled={saveDisabled}
          >
            {saving ? 'Saving...' : saveLabel}
          </button>
        </div>
      </div>
      {#if error}
        <p class="text-red-400 text-sm">{error}</p>
      {/if}
    </header>
  {/if}

  <div class="space-y-8">
  <div class="flex gap-2">
    <button
      type="button"
      class="px-3 py-1 rounded text-sm {mode === 'form' ? 'bg-pub-accent text-white' : 'bg-pub-dark text-pub-muted hover:text-white'}"
      on:click={() => mode === 'yaml' && switchToForm()}
    >
      Form
    </button>
    <button
      type="button"
      class="px-3 py-1 rounded text-sm {mode === 'yaml' ? 'bg-pub-accent text-white' : 'bg-pub-dark text-pub-muted hover:text-white'}"
      on:click={() => mode === 'form' && switchToYaml()}
    >
      YAML
    </button>
  </div>

  {#if mode === 'yaml'}
    {#if YamlEditorComponent}
      <svelte:component
        this={YamlEditorComponent}
        value={yamlStr}
        onChange={(v: string) => (yamlStr = v)}
        schema={QUIZ_JSON_SCHEMA}
      />
    {:else}
      <div class="p-4 bg-pub-darker rounded-lg text-pub-muted animate-pulse">Loading editor…</div>
    {/if}
    {#if !stickyToolbar}
      <div class="flex gap-4 items-center flex-wrap">
        <button
          type="button"
          class="px-6 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          on:click={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
        {#if error}
          <span class="text-red-400 text-sm">{error}</span>
        {/if}
      </div>
    {/if}
  {:else}
  <section class="bg-pub-darker rounded-lg p-6">
    <h2 class="text-lg font-semibold mb-4">Quiz info</h2>
    <div class="space-y-4">
      <div>
        <label for="quiz-name" class="block text-sm text-pub-muted mb-1">Title</label>
        <input
          id="quiz-name"
          type="text"
          bind:value={quiz.meta.name}
          placeholder="Pub Quiz Night"
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        />
      </div>
      <div>
        <label for="quiz-author" class="block text-sm text-pub-muted mb-1">Author</label>
        <input
          id="quiz-author"
          type="text"
          bind:value={quiz.meta.author}
          placeholder="Your name"
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        />
      </div>
      <div>
        <label for="quiz-timer" class="block text-sm text-pub-muted mb-1">Default timer (seconds)</label>
        <input
          id="quiz-timer"
          type="number"
          min="0"
          bind:value={quiz.meta.default_timer}
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        />
      </div>
      <div>
        <label for="quiz-scoring" class="block text-sm text-pub-muted mb-1">Scoring</label>
        <select
          id="quiz-scoring"
          value={quiz.meta.scoring_mode ?? 'standard'}
          on:change={(e) => (quiz.meta.scoring_mode = (e.currentTarget as HTMLSelectElement).value as 'standard' | 'ranked')}
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        >
          <option value="standard">Standard (1 point per correct)</option>
          <option value="ranked">Ranked (first gets most points)</option>
        </select>
      </div>
      <div>
        <label for="quiz-option-label-style" class="block text-sm text-pub-muted mb-1">Choice option labels</label>
        <select
          id="quiz-option-label-style"
          value={quiz.meta.option_label_style ?? 'letters'}
          on:change={(e) =>
            (quiz.meta.option_label_style = (e.currentTarget as HTMLSelectElement).value as 'letters' | 'numbers')}
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        >
          <option value="letters">Letters (A, B, C...)</option>
          <option value="numbers">Numbers (1, 2, 3...)</option>
        </select>
      </div>
      {#if (quiz.meta.scoring_mode ?? 'standard') === 'ranked'}
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="quiz-ranked-max" class="block text-sm text-pub-muted mb-1">Max points (1st)</label>
            <input
              id="quiz-ranked-max"
              type="number"
              min="0"
              placeholder="100"
              bind:value={quiz.meta.ranked_max_points}
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label for="quiz-ranked-min" class="block text-sm text-pub-muted mb-1">Min points (last)</label>
            <input
              id="quiz-ranked-min"
              type="number"
              min="0"
              placeholder="10"
              bind:value={quiz.meta.ranked_min_points}
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
          </div>
        </div>
      {/if}
    </div>
  </section>

  {#each quiz.rounds as round, ri}
    <section class="bg-pub-darker rounded-lg p-6">
      <div class="flex justify-between items-center mb-4">
        <input
          type="text"
          bind:value={round.name}
          placeholder="Round name"
          class="flex-1 mr-4 bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        />
        <button
          type="button"
          class="px-3 py-1 text-red-400 hover:text-red-300 text-sm"
          on:click={() => removeRound(ri)}
          disabled={quiz.rounds.length <= 1}
        >
          Remove round
        </button>
      </div>

      {#each round.questions as question, qi (question.id)}
        <div animate:flip={{ duration: 320, easing: cubicOut }}>
        <QuestionForm
          {question}
          roundIndex={ri}
          questionIndex={qi}
          questionNumber={qi + 1}
          questionCount={round.questions.length}
          canMoveUp={qi > 0}
          canMoveDown={qi < round.questions.length - 1}
          onMoveUp={() => moveQuestionInRound(ri, qi, -1)}
          onMoveDown={() => moveQuestionInRound(ri, qi, 1)}
          recentlyReordered={reorderHighlightId === question.id}
          {quizFilename}
          imageActionPending={imageActionPending}
          imageImportUrlDraft={imageImportUrlDrafts[question.id] ?? ''}
          onPatch={(patch) => {
            quiz = actUpdateQuestionField(quiz, ri, qi, patch);
          }}
          onImageImportUrlChange={(value) => setImageImportUrlDraft(question.id, value)}
          onTransform={(fn) => {
            quiz = actUpdateQuestion(quiz, ri, qi, fn);
          }}
          onAddOption={() => {
            quiz = actAddOption(quiz, ri, qi);
          }}
          onRemoveOption={(oi) => {
            quiz = actRemoveOption(quiz, ri, qi, oi);
          }}
          onToggleMultiSelectAnswer={(oi, checked) => {
            quiz = actToggleMultiSelectAnswer(quiz, ri, qi, oi, checked);
          }}
          onUpdateSliderQuestion={(field, value) => {
            quiz = actUpdateSliderQuestion(quiz, ri, qi, field, value);
          }}
          onAddInputAnswer={() => {
            quiz = actAddInputAnswer(quiz, ri, qi);
          }}
          onRemoveInputAnswer={(ai) => {
            quiz = actRemoveInputAnswer(quiz, ri, qi, ai);
          }}
          onAddMatchingItem={() => {
            quiz = actAddMatchingItem(quiz, ri, qi);
          }}
          onRemoveMatchingItem={(ii) => {
            quiz = actRemoveMatchingItem(quiz, ri, qi, ii);
          }}
          onAddMatchingOption={() => {
            quiz = actAddMatchingOption(quiz, ri, qi);
          }}
          onRemoveMatchingOption={(oi) => {
            quiz = actRemoveMatchingOption(quiz, ri, qi, oi);
          }}
          onSetMatchingAnswer={(itemIndex, optionIndex) => {
            quiz = actSetMatchingAnswer(quiz, ri, qi, itemIndex, optionIndex);
          }}
          onUpdateHotspotAnswer={(patch) => {
            quiz = actUpdateHotspotAnswer(quiz, ri, qi, patch);
          }}
          onSetHotspotImageAspectRatio={(ar) => {
            quiz = actSetHotspotImageAspectRatio(quiz, ri, qi, ar);
          }}
          onImageUpload={(file) => handleImageUploadForQuestion(question.id, file)}
          onImageImport={(url) => handleImageImportForQuestion(question.id, url)}
          onClearImage={() => {
            clearImageImportUrlDraft(question.id);
            clearImage(ri, qi);
          }}
          onSetQuestionType={(type) => setQuestionType(ri, qi, type)}
          onRemoveQuestion={() => openRemoveQuestionModal(ri, qi)}
          removeDisabled={round.questions.length <= 1}
        />
        </div>
      {/each}
      <button
        type="button"
        class="text-pub-accent hover:underline"
        on:click={() => addQuestion(ri)}
      >
        + Add question
      </button>
    </section>
  {/each}

  <div class="flex gap-4 items-center flex-wrap">
    {#if mode === 'form'}
      <button
        type="button"
        class="px-4 py-2 text-pub-muted hover:text-white"
        on:click={() => addRound()}
      >
        + Add round
      </button>
    {/if}
    {#if !stickyToolbar}
      <button
        type="button"
        class="px-6 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        on:click={handleSave}
        disabled={saveDisabled}
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
      {#if error}
        <span class="text-red-400 text-sm">{error}</span>
      {/if}
    {/if}
  </div>
  {/if}
  </div>
</div>

<ConfirmModal
  open={questionPendingRemove != null}
  title="Remove question?"
  titleId="quiz-editor-remove-question-modal"
  confirmLabel="Remove question"
  confirmButtonClass="bg-red-700"
  onClose={closeRemoveQuestionModal}
  onConfirm={confirmRemoveQuestion}
>
  {#if questionPendingRemove}
    {@const pr = questionPendingRemove}
    {@const pendingRound = quiz.rounds[pr.ri]}
    {@const pendingQ = pendingRound?.questions[pr.qi]}
    {#if pendingQ}
      <p class="text-sm text-pub-muted mb-2">
        Round:
        <span class="text-pub-gold font-medium">{pendingRound.name || `Round ${pr.ri + 1}`}</span>
      </p>
      <p class="text-sm text-pub-muted mb-5">
        This will remove the question from your draft. Save to persist; leaving without saving
        discards changes.
      </p>
      <p class="text-xs text-pub-muted font-mono line-clamp-4 break-words rounded border border-pub-muted bg-pub-dark p-3">
        {pendingQ.text?.trim() || '(empty question)'}
      </p>
    {:else}
      <p class="text-sm text-pub-muted mb-5">Remove this question from the quiz?</p>
    {/if}
  {/if}
</ConfirmModal>
