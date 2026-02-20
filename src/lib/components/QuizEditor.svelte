<script lang="ts">
  import type { Quiz, Round, Question, ChoiceQuestion, InputQuestion } from '$lib/types/quiz.js';
  import {
    createEmptyChoiceQuestion,
    createEmptyInputQuestion,
    createEmptyQuiz,
    generateQuestionId,
  } from '$lib/types/quiz.js';
  import YamlEditor from '$lib/components/YamlEditor.svelte';
  import { quizToYaml, yamlToQuiz } from '$lib/utils/quiz-yaml.js';
  import { QUIZ_JSON_SCHEMA } from '$lib/schema/quiz-json-schema.js';

  export let quiz: Quiz;
  export let onSave: (quiz: Quiz) => Promise<void>;
  export let saveLabel = 'Save';
  export let quizFilename: string | undefined = undefined;

  let mode: 'form' | 'yaml' = 'form';
  let yamlStr = '';
  let saving = false;
  let uploadingFor: { ri: number; qi: number } | null = null;
  let error = '';

  function switchToYaml() {
    error = '';
    yamlStr = quizToYaml(quiz);
    mode = 'yaml';
  }

  function switchToForm() {
    error = '';
    try {
      quiz = yamlToQuiz(yamlStr);
      mode = 'form';
    } catch (e) {
      error = String(e);
    }
  }

  function addRound() {
    quiz = {
      ...quiz,
      rounds: [
        ...quiz.rounds,
        {
          name: `Round ${quiz.rounds.length + 1}`,
          questions: [createEmptyChoiceQuestion(generateQuestionId(quiz.rounds.length, 0))],
        },
      ],
    };
  }

  function removeRound(ri: number) {
    if (quiz.rounds.length <= 1) return;
    quiz = {
      ...quiz,
      rounds: quiz.rounds.filter((_, i) => i !== ri),
    };
  }

  function addQuestion(ri: number) {
    const round = quiz.rounds[ri];
    const newQ = createEmptyChoiceQuestion(generateQuestionId(ri, round.questions.length));
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri ? { ...r, questions: [...r.questions, newQ] } : r
      ),
    };
  }

  function removeQuestion(ri: number, qi: number) {
    const round = quiz.rounds[ri];
    if (round.questions.length <= 1) return;
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri ? { ...r, questions: r.questions.filter((_, j) => j !== qi) } : r
      ),
    };
  }

  function setQuestionType(ri: number, qi: number, type: 'choice' | 'input') {
    const q = quiz.rounds[ri].questions[qi];
    if (q.type === type) return;
    const base = { id: q.id, text: q.text, image: q.image };
    const newQ: Question =
      type === 'choice'
        ? { ...base, type: 'choice', options: ['', ''], answer: 0 }
        : { ...base, type: 'input', answer: [''] };
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? newQ : qu)) } : r
      ),
    };
  }

  function addOption(ri: number, qi: number) {
    const q = quiz.rounds[ri].questions[qi] as ChoiceQuestion;
    if (q.type !== 'choice') return;
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri
          ? {
              ...r,
              questions: r.questions.map((qu, j) =>
                j === qi ? { ...qu, options: [...qu.options, ''] } : qu
              ),
            }
          : r
      ),
    };
  }

  function removeOption(ri: number, qi: number, oi: number) {
    const q = quiz.rounds[ri].questions[qi] as ChoiceQuestion;
    if (q.type !== 'choice' || q.options.length <= 2) return;
    const newOptions = q.options.filter((_, i) => i !== oi);
    const newAnswer = Math.min(q.answer, newOptions.length - 1);
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri
          ? {
              ...r,
              questions: r.questions.map((qu, j) =>
                j === qi ? { ...qu, options: newOptions, answer: newAnswer } : qu
              ),
            }
          : r
      ),
    };
  }

  function addInputAnswer(ri: number, qi: number) {
    const q = quiz.rounds[ri].questions[qi] as InputQuestion;
    if (q.type !== 'input') return;
    const current = Array.isArray(q.answer) ? q.answer : [''];
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri
          ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...qu, answer: [...current, ''] } : qu)) }
          : r
      ),
    };
  }

  function removeInputAnswer(ri: number, qi: number, ai: number) {
    const q = quiz.rounds[ri].questions[qi] as InputQuestion;
    if (q.type !== 'input' || q.answer.length <= 1) return;
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri
          ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...qu, answer: qu.answer.filter((_, k) => k !== ai) } : qu)) }
          : r
      ),
    };
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
      const q = quiz.rounds[ri].questions[qi];
      quiz = {
        ...quiz,
        rounds: quiz.rounds.map((r, i) =>
          i === ri
            ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...qu, image: data.filename } : qu)) }
            : r
        ),
      };
    } catch (e) {
      error = String(e);
    } finally {
      uploadingFor = null;
    }
  }

  function clearImage(ri: number, qi: number) {
    const q = quiz.rounds[ri].questions[qi];
    quiz = {
      ...quiz,
      rounds: quiz.rounds.map((r, i) =>
        i === ri
          ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...qu, image: undefined } : qu)) }
          : r
      ),
    };
  }
</script>

<div class="space-y-8">
  {#if error}
    <div class="p-4 bg-red-900/50 rounded-lg text-red-200">{error}</div>
  {/if}

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
    <YamlEditor
      value={yamlStr}
      onChange={(v) => (yamlStr = v)}
      schema={QUIZ_JSON_SCHEMA}
    />
    <div class="flex gap-4">
      <button
        type="button"
        class="px-6 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        on:click={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
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
        <div class="mb-6 p-4 bg-pub-dark rounded-lg">
          <div class="flex gap-2 mb-2">
            <select
              value={question.type}
              on:change={(e) => setQuestionType(ri, qi, (e.currentTarget.value as 'choice' | 'input'))}
              class="bg-pub-darker border border-pub-muted rounded px-2 py-1 text-sm"
            >
              <option value="choice">Multiple choice</option>
              <option value="input">Fill in the blank</option>
            </select>
            <button
              type="button"
              class="text-red-400 hover:text-red-300 text-sm"
              on:click={() => removeQuestion(ri, qi)}
              disabled={round.questions.length <= 1}
            >
              Remove
            </button>
          </div>
          <div class="mb-3">
            <label for="q-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Question</label>
            <textarea
              id="q-{ri}-{qi}"
              bind:value={question.text}
              placeholder="What is the capital of Australia?"
              rows="2"
              class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
            ></textarea>
          </div>
          <div class="mb-3">
            <label for="img-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Image (optional)</label>
            <input
              id="img-{ri}-{qi}"
              type="text"
              bind:value={question.image}
              placeholder="https://... or leave empty"
              class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2 mb-2"
            />
            {#if quizFilename}
              <div class="flex items-center gap-2">
                <label for="upload-{ri}-{qi}" class="text-sm text-pub-muted">Or upload</label>
                <input
                  id="upload-{ri}-{qi}"
                  type="file"
                  accept="image/*"
                  class="text-sm text-pub-muted"
                  on:change={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) handleImageUpload(ri, qi, file);
                    e.currentTarget.value = '';
                  }}
                  disabled={uploadingFor?.ri === ri && uploadingFor?.qi === qi}
                />
                {#if uploadingFor?.ri === ri && uploadingFor?.qi === qi}
                  <span class="text-sm text-pub-muted">Uploading...</span>
                {/if}
              </div>
            {/if}
            {#if question.image}
              <button
                type="button"
                class="mt-2 text-sm text-red-400 hover:text-red-300"
                on:click={() => clearImage(ri, qi)}
              >
                Clear image
              </button>
            {/if}
          </div>
          {#if question.type === 'choice'}
            <div class="space-y-2" role="group" aria-label="Options (select correct)">
              <span class="block text-sm text-pub-muted">Options (select correct)</span>
              {#each question.options as opt, oi}
                <div class="flex gap-2 items-center">
                  <input
                    type="radio"
                    name="correct-{ri}-{qi}"
                    checked={question.answer === oi}
                    on:change={() => {
                      const q = quiz.rounds[ri].questions[qi] as ChoiceQuestion;
                      quiz = {
                        ...quiz,
                        rounds: quiz.rounds.map((r, i) =>
                          i === ri
                            ? { ...r, questions: r.questions.map((qu, j) => (j === qi ? { ...q, answer: oi } : qu)) }
                            : r
                        ),
                      };
                    }}
                  />
                  <input
                    type="text"
                    bind:value={question.options[oi]}
                    placeholder="Option {oi + 1}"
                    class="flex-1 bg-pub-darker border border-pub-muted rounded px-3 py-1"
                  />
                  <button
                    type="button"
                    class="text-red-400 text-sm"
                    on:click={() => removeOption(ri, qi, oi)}
                    disabled={question.options.length <= 2}
                  >
                    ×
                  </button>
                </div>
              {/each}
              <button
                type="button"
                class="text-sm text-pub-accent hover:underline"
                on:click={() => addOption(ri, qi)}
              >
                + Add option
              </button>
            </div>
          {:else}
            <div class="space-y-2" role="group" aria-label="Accepted answers">
              <span class="block text-sm text-pub-muted">Accepted answers (for typos, add alternatives)</span>
              {#each (Array.isArray(question.answer) ? question.answer : ['']) as ans, ai}
                <div class="flex gap-2">
                  <input
                    type="text"
                    bind:value={question.answer[ai]}
                    placeholder="Correct answer"
                    class="flex-1 bg-pub-darker border border-pub-muted rounded px-3 py-1"
                  />
                  <button
                    type="button"
                    class="text-red-400 text-sm"
                    on:click={() => removeInputAnswer(ri, qi, ai)}
                    disabled={question.answer.length <= 1}
                  >
                    ×
                  </button>
                </div>
              {/each}
              <button
                type="button"
                class="text-sm text-pub-accent hover:underline"
                on:click={() => addInputAnswer(ri, qi)}
              >
                + Add alternative
              </button>
            </div>
          {/if}
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

  <div class="flex gap-4">
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
  </div>
  {/if}
</div>
