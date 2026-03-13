<script lang="ts">
  import type { Quiz } from '$lib/types/quiz.js';
  import QuestionForm from '$lib/components/quiz-editor/QuestionForm.svelte';
  import {
    addRound as actAddRound,
    removeRound as actRemoveRound,
    addQuestion as actAddQuestion,
    removeQuestion as actRemoveQuestion,
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

  let mode: 'form' | 'yaml' =
    (typeof window !== 'undefined' && (localStorage.getItem(STORAGE_KEY) as 'form' | 'yaml' | null) === 'yaml')
      ? 'yaml'
      : 'form';
  let yamlStr = '';
  $: if (mode === 'yaml' && quiz) yamlStr = quizToYaml(quiz);
  let saving = false;
  let uploadingFor: { ri: number; qi: number } | null = null;
  let error = '';

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

  function removeQuestion(ri: number, qi: number) {
    quiz = actRemoveQuestion(quiz, ri, qi);
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

  async function handleImageUpload(ri: number, qi: number, file: File) {
    if (!quizFilename) return;
    uploadingFor = { ri, qi };
    error = '';
    try {
      const formData = new FormData();
      formData.append('quizFilename', quizFilename);
      formData.append('questionId', quiz.rounds[ri].questions[qi].id);
      formData.append('file', file);
      const res = await fetch('/api/quizzes/images', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      quiz = actUpdateQuestionField(quiz, ri, qi, { image: data.filename });
    } catch (e) {
      error = String(e);
    } finally {
      uploadingFor = null;
    }
  }

  function clearImage(ri: number, qi: number) {
    quiz = actClearImage(quiz, ri, qi);
  }
</script>

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

      {#each round.questions as question, qi}
        <QuestionForm
          {question}
          roundIndex={ri}
          questionIndex={qi}
          {quizFilename}
          {uploadingFor}
          onPatch={(patch) => {
            quiz = actUpdateQuestionField(quiz, ri, qi, patch);
          }}
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
          onImageUpload={(file) => handleImageUpload(ri, qi, file)}
          onClearImage={() => clearImage(ri, qi)}
          onSetQuestionType={(type) => setQuestionType(ri, qi, type)}
          onRemoveQuestion={() => removeQuestion(ri, qi)}
          removeDisabled={round.questions.length <= 1}
        />
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
    <button
      type="button"
      class="px-6 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
      on:click={handleSave}
      disabled={saving || (mode === 'form' && !quiz.meta.name.trim())}
    >
      {saving ? 'Saving...' : saveLabel}
    </button>
    {#if error}
      <span class="text-red-400 text-sm">{error}</span>
    {/if}
  </div>
  {/if}
</div>
