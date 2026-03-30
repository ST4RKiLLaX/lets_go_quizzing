<script lang="ts">
  import type { Question, HotspotQuestion, InputQuestion, MatchingQuestion } from '$lib/types/quiz.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  export let question: Question;
  export let roundIndex: number;
  export let questionIndex: number;
  export let quizFilename: string | undefined = undefined;
  export let imageActionPending: { questionId: string; mode: 'upload' | 'import' } | null = null;
  export let onPatch: (patch: Partial<Question>) => void;
  export let onTransform: (fn: (q: Question) => Question) => void;
  export let onAddOption: () => void;
  export let onRemoveOption: (oi: number) => void;
  export let onToggleMultiSelectAnswer: (oi: number, checked: boolean) => void;
  export let onUpdateSliderQuestion: (field: 'min' | 'max' | 'step' | 'answer', value: number) => void;
  export let onAddInputAnswer: () => void;
  export let onRemoveInputAnswer: (ai: number) => void;
  export let onAddMatchingItem: () => void;
  export let onRemoveMatchingItem: (ii: number) => void;
  export let onAddMatchingOption: () => void;
  export let onRemoveMatchingOption: (oi: number) => void;
  export let onSetMatchingAnswer: (itemIndex: number, optionIndex: number) => void;
  export let onUpdateHotspotAnswer: (patch: Partial<HotspotQuestion['answer']>) => void;
  export let onSetHotspotImageAspectRatio: (ar: number) => void;
  export let onImageUpload: (file: File) => void;
  export let onImageImport: (url: string) => void;
  export let onClearImage: () => void;
  export let onSetQuestionType: (type: Question['type']) => void;
  export let onRemoveQuestion: () => void;
  export let removeDisabled = false;

  export let questionNumber: number;
  export let questionCount: number;
  export let canMoveUp: boolean;
  export let canMoveDown: boolean;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  /** Brief highlight after user reorders this question */
  export let recentlyReordered = false;

  const ri = roundIndex;
  const qi = questionIndex;

  $: canUploadFile = !!quizFilename?.trim();
  $: isUploadingImage = imageActionPending?.questionId === question.id && imageActionPending.mode === 'upload';
  $: isImportingImage = imageActionPending?.questionId === question.id && imageActionPending.mode === 'import';
  $: imageActionDisabled = isUploadingImage || isImportingImage;
  $: currentImageValue = question.image?.trim() ?? '';
  $: canImportCurrentImage = canUploadFile && !imageActionDisabled && /^https?:\/\//i.test(currentImageValue);

  /** Avoid <label for> focusing the hidden input — browsers scroll it into view and break <main> scroll. */
  let imageFileInput: HTMLInputElement | undefined;
  function triggerImageFilePicker() {
    imageFileInput?.click();
  }
</script>

<div
  class="mb-6 p-4 bg-pub-dark rounded-lg transition-[box-shadow,ring-width] duration-500 ease-out {recentlyReordered
    ? 'ring-2 ring-amber-400/50 shadow-[0_0_24px_rgba(251,191,36,0.12)]'
    : 'ring-0 ring-transparent shadow-none'}"
>
  <div class="flex gap-3 items-start">
    <div
      class="flex flex-col items-center gap-0.5 shrink-0 w-10 sm:w-11 pt-0.5"
      role="group"
      aria-label="Question {questionNumber} of {questionCount}, reorder"
    >
      <button
        type="button"
        class="p-1 rounded-md border border-pub-muted text-pub-muted hover:text-pub-gold hover:border-pub-gold/40 disabled:opacity-25 disabled:cursor-not-allowed"
        disabled={!canMoveUp}
        aria-label="Move question {questionNumber} of {questionCount} up"
        on:click={onMoveUp}
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
          aria-hidden="true"
        >
          <polyline points="6 15 12 9 18 15" />
        </svg>
      </button>
      {#key questionNumber}
        <span
          in:scale={{ duration: 220, delay: 40, start: 0.75, opacity: 0.7, easing: cubicOut }}
          class="text-pub-gold font-bold text-base tabular-nums leading-none py-1 inline-block min-w-[1.25rem] text-center"
          title="Question {questionNumber} of {questionCount}"
          aria-hidden="true"
        >
          {questionNumber}
        </span>
      {/key}
      <span class="sr-only">Question {questionNumber} of {questionCount}</span>
      <button
        type="button"
        class="p-1 rounded-md border border-pub-muted text-pub-muted hover:text-pub-gold hover:border-pub-gold/40 disabled:opacity-25 disabled:cursor-not-allowed"
        disabled={!canMoveDown}
        aria-label="Move question {questionNumber} of {questionCount} down"
        on:click={onMoveDown}
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
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
    <div class="min-w-0 flex-1">
  <div class="flex gap-2 mb-2">
    <select
      value={question.type}
      on:change={(e) =>
        onSetQuestionType(
          (e.currentTarget.value as Question['type'])
        )}
      class="bg-pub-darker border border-pub-muted rounded px-2 py-1 text-sm"
    >
      <option value="choice">Multiple choice</option>
      <option value="true_false">True / False</option>
      <option value="poll">Poll</option>
      <option value="multi_select">Multi-select</option>
      <option value="reorder">Reorder</option>
      <option value="matching">Matching</option>
      <option value="hotspot">Hotspot (image click)</option>
      <option value="slider">Slider</option>
      <option value="input">Fill in the blank</option>
      <option value="open_ended">Long text response</option>
      <option value="word_cloud">Word cloud</option>
    </select>
    <button
      type="button"
      class="text-red-400 hover:text-red-300 text-sm"
      on:click={onRemoveQuestion}
      disabled={removeDisabled}
    >
      Remove
    </button>
  </div>
  <div class="mb-3">
    <label for="q-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Question</label>
    <textarea
      id="q-{ri}-{qi}"
      value={question.text}
      on:input={(e) => onPatch({ text: (e.currentTarget as HTMLTextAreaElement).value })}
      placeholder="What is the capital of Australia?"
      rows="2"
      class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
    ></textarea>
  </div>
  {#if ['choice', 'true_false', 'multi_select', 'slider', 'input', 'reorder', 'matching', 'hotspot'].includes(question.type)}
    <div class="mb-3">
      <label for="points-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Points multiplier</label>
      <input
        id="points-{ri}-{qi}"
        type="number"
        min="0.1"
        step="0.5"
        placeholder="1 (default)"
        class="w-24 bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
        value={question.points ?? ''}
        on:input={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          onPatch({ points: v === '' ? undefined : Number(v) });
        }}
      />
    </div>
  {/if}
  <div class="mb-3">
    <label for="img-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Image</label>
    <input
      id="img-{ri}-{qi}"
      type="text"
      value={question.image ?? ''}
      on:input={(e) => onPatch({ image: (e.currentTarget as HTMLInputElement).value || undefined })}
      placeholder={quizFilename?.trim()
        ? question.type === 'hotspot'
          ? 'stored filename or https://...'
          : 'stored filename or https://...'
        : 'stored filename or https://... (save quiz first to import or upload)'}
      class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2 mb-2"
    />
    <p class="mb-2 text-xs text-pub-muted">
      Paste an image URL to import it locally, or choose a file.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <input
        bind:this={imageFileInput}
        id="upload-{ri}-{qi}"
        type="file"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        class="fixed -left-[9999px] top-0 h-px w-px opacity-0 overflow-hidden m-0 p-0 border-0"
        on:change={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) onImageUpload(file);
          e.currentTarget.value = '';
        }}
        disabled={!canUploadFile || imageActionDisabled}
      />
      <button
        type="button"
        class="inline-flex items-center px-3 py-1.5 text-sm rounded-lg border border-pub-muted bg-pub-dark text-pub-gold select-none"
        class:opacity-40={!canUploadFile || imageActionDisabled}
        class:cursor-pointer={canUploadFile && !imageActionDisabled}
        class:hover:bg-pub-darker={canUploadFile && !imageActionDisabled}
        disabled={!canUploadFile || imageActionDisabled}
        title={!canUploadFile
          ? 'Open this quiz from the creator list or save a new quiz first, then import or upload.'
          : undefined}
        on:click={triggerImageFilePicker}
      >
        Choose image file
      </button>
      <button
        type="button"
        class="inline-flex items-center px-3 py-1.5 text-sm rounded-lg border border-pub-muted bg-pub-dark text-pub-gold select-none"
        class:opacity-40={!canImportCurrentImage}
        class:cursor-pointer={canImportCurrentImage}
        class:hover:bg-pub-darker={canImportCurrentImage}
        disabled={!canImportCurrentImage}
        title={!canUploadFile
          ? 'Open this quiz from the creator list or save a new quiz first, then import or upload.'
          : currentImageValue && !/^https?:\/\//i.test(currentImageValue)
            ? 'Paste an http or https image URL into the image field to import it.'
            : undefined}
        on:click={() => onImageImport(currentImageValue)}
      >
        Import URL
      </button>
      {#if isUploadingImage}
        <span class="text-sm text-pub-muted">Uploading…</span>
      {:else if isImportingImage}
        <span class="text-sm text-pub-muted">Importing…</span>
      {:else if !canUploadFile}
        <span class="text-xs text-pub-muted max-w-sm">
          Save the quiz (or open it from your list) to enable imports and uploads.
        </span>
      {/if}
    </div>
    {#if question.image}
      <button
        type="button"
        class="mt-2 text-sm text-red-400 hover:text-red-300"
        on:click={onClearImage}
      >
        Clear image
      </button>
    {/if}
  </div>
  {#if question.type === 'hotspot'}
    {@const hq = question as HotspotQuestion}
    {@const imgSrc = getQuestionImageSrc(hq.image, quizFilename)}
    {#if imgSrc}
      <div class="space-y-3 mb-3">
        <span class="block text-sm text-pub-muted">Click image to set target</span>
        <div
          class="relative inline-block max-w-full cursor-crosshair"
          role="button"
          tabindex="0"
          on:click={(e) => {
            const target = e.currentTarget;
            const img = target.querySelector('img');
            if (!img) return;
            const rect = img.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            const clampedX = Math.max(0, Math.min(1, x));
            const clampedY = Math.max(0, Math.min(1, y));
            onUpdateHotspotAnswer({ x: clampedX, y: clampedY });
          }}
          on:keydown={(e) => e.key === 'Enter' && e.currentTarget.click()}
        >
          <img
            src={imgSrc}
            alt=""
            class="max-w-full rounded-lg block"
            on:load={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              const ar = img.naturalHeight / img.naturalWidth;
              onSetHotspotImageAspectRatio(ar);
            }}
          />
          <div
            class="absolute border-2 border-pub-gold bg-pub-gold/20 pointer-events-none rounded-full origin-center"
            style="left: {((hq.answer.x - hq.answer.radius / (hq.imageAspectRatio ?? 1)) * 100)}%; top: {((hq.answer.y - (hq.answer.radiusY ?? hq.answer.radius)) * 100)}%; width: {(hq.answer.radius * 2 / (hq.imageAspectRatio ?? 1)) * 100}%; height: {((hq.answer.radiusY ?? hq.answer.radius) * 2) * 100}%; transform: rotate({hq.answer.rotation ?? 0}deg);"
          ></div>
          <div
            class="absolute w-2 h-2 rounded-full bg-pub-gold border border-white pointer-events-none"
            style="left: {(hq.answer.x * 100)}%; top: {(hq.answer.y * 100)}%; transform: translate(-50%, -50%);"
          ></div>
        </div>
        <div>
          <label for="hotspot-radius-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">
            Tolerance radius: {Math.round(hq.answer.radius * 100)}%
          </label>
          <input
            id="hotspot-radius-{ri}-{qi}"
            type="range"
            min="0.02"
            max="0.3"
            step="0.01"
            value={hq.answer.radius}
            class="w-full"
            on:input={(e) =>
              onUpdateHotspotAnswer({ radius: Number((e.currentTarget as HTMLInputElement).value) })}
          />
        </div>
        <div>
          <label for="hotspot-radiusY-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">
            Radius Y (optional, for ellipse): {Math.round((hq.answer.radiusY ?? hq.answer.radius) * 100)}%
          </label>
          <input
            id="hotspot-radiusY-{ri}-{qi}"
            type="range"
            min="0.02"
            max="0.3"
            step="0.01"
            value={hq.answer.radiusY ?? hq.answer.radius}
            class="w-full"
            on:input={(e) =>
              onUpdateHotspotAnswer({ radiusY: Number((e.currentTarget as HTMLInputElement).value) })}
          />
        </div>
        <div>
          <label for="hotspot-rotation-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">
            Hotspot rotation: {Math.round(hq.answer.rotation ?? 0)}°
          </label>
          <input
            id="hotspot-rotation-{ri}-{qi}"
            type="range"
            min="0"
            max="360"
            step="5"
            value={hq.answer.rotation ?? 0}
            class="w-full"
            on:input={(e) =>
              onUpdateHotspotAnswer({ rotation: Number((e.currentTarget as HTMLInputElement).value) })}
          />
        </div>
      </div>
    {:else}
      <p class="text-sm text-pub-muted">Add an image above to set the target</p>
    {/if}
  {:else if question.type === 'choice' || question.type === 'poll' || question.type === 'multi_select' || question.type === 'reorder'}
    <div class="space-y-2" role="group" aria-label="Options">
      <span class="block text-sm text-pub-muted">
        {question.type === 'poll'
          ? 'Poll options'
          : question.type === 'multi_select'
            ? 'Options (check all correct)'
            : question.type === 'reorder'
              ? 'Options (enter in correct order)'
              : 'Options (select correct)'}
      </span>
      {#each question.options as _opt, oi}
        <div class="flex gap-2 items-center">
          {#if question.type === 'choice'}
            <input
              type="radio"
              name="correct-{ri}-{qi}"
              checked={question.answer === oi}
              on:change={() => onPatch({ answer: oi })}
            />
          {:else if question.type === 'multi_select'}
            <input
              type="checkbox"
              checked={question.answer.includes(oi)}
              on:change={(e) => onToggleMultiSelectAnswer(oi, e.currentTarget.checked)}
            />
          {:else if question.type === 'reorder'}
            <span class="text-pub-muted font-mono w-6 text-center">{question.answer.indexOf(oi) + 1}</span>
          {/if}
          <input
            type="text"
            value={question.options[oi]}
            on:input={(e) => {
              const val = (e.currentTarget as HTMLInputElement).value;
              onTransform((q) => {
                if (!('options' in q) || !Array.isArray(q.options)) return q;
                const opts = [...q.options];
                opts[oi] = val;
                return { ...q, options: opts } as Question;
              });
            }}
            placeholder="Option {oi + 1}"
            class="flex-1 bg-pub-darker border border-pub-muted rounded px-3 py-1"
          />
          <button
            type="button"
            class="text-red-400 text-sm"
            on:click={() => onRemoveOption(oi)}
            disabled={question.options.length <= 2}
          >
            ×
          </button>
        </div>
      {/each}
      <button
        type="button"
        class="text-sm text-pub-accent hover:underline"
        on:click={onAddOption}
      >
        + Add option
      </button>
    </div>
  {:else if question.type === 'slider'}
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="slider-min-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Minimum</label>
        <input
          id="slider-min-{ri}-{qi}"
          type="number"
          value={question.min}
          on:change={(e) => onUpdateSliderQuestion('min', Number((e.currentTarget as HTMLInputElement).value))}
          class="w-full bg-pub-darker border border-pub-muted rounded px-3 py-1"
        />
      </div>
      <div>
        <label for="slider-max-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Maximum</label>
        <input
          id="slider-max-{ri}-{qi}"
          type="number"
          value={question.max}
          on:change={(e) => onUpdateSliderQuestion('max', Number((e.currentTarget as HTMLInputElement).value))}
          class="w-full bg-pub-darker border border-pub-muted rounded px-3 py-1"
        />
      </div>
      <div>
        <label for="slider-step-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Step</label>
        <input
          id="slider-step-{ri}-{qi}"
          type="number"
          min="0.01"
          step="any"
          value={question.step}
          on:change={(e) => onUpdateSliderQuestion('step', Number((e.currentTarget as HTMLInputElement).value))}
          class="w-full bg-pub-darker border border-pub-muted rounded px-3 py-1"
        />
      </div>
      <div>
        <label for="slider-answer-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Correct value</label>
        <input
          id="slider-answer-{ri}-{qi}"
          type="number"
          step="any"
          value={question.answer}
          on:change={(e) => onUpdateSliderQuestion('answer', Number((e.currentTarget as HTMLInputElement).value))}
          class="w-full bg-pub-darker border border-pub-muted rounded px-3 py-1"
        />
      </div>
    </div>
  {:else if question.type === 'true_false'}
    <div class="space-y-2" role="group" aria-label="Correct answer">
      <span class="block text-sm text-pub-muted">Correct answer</span>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="tf-{ri}-{qi}"
          checked={question.answer === true}
          on:change={() => onPatch({ answer: true })}
        />
        <span>True</span>
      </label>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="tf-{ri}-{qi}"
          checked={question.answer === false}
          on:change={() => onPatch({ answer: false })}
        />
        <span>False</span>
      </label>
    </div>
  {:else if question.type === 'input'}
    <div class="space-y-2" role="group" aria-label="Accepted answers">
      <span class="block text-sm text-pub-muted">Accepted answers (for typos, add alternatives)</span>
      {#each (Array.isArray(question.answer) ? question.answer : ['']) as _ans, ai}
        <div class="flex gap-2">
          <input
            type="text"
            value={(question as InputQuestion).answer[ai]}
            on:input={(e) => {
              const val = (e.currentTarget as HTMLInputElement).value;
              onTransform((q) => {
                const qq = q as InputQuestion;
                const ans = [...qq.answer];
                ans[ai] = val;
                return { ...q, answer: ans } as Question;
              });
            }}
            placeholder="Correct answer"
            class="flex-1 bg-pub-darker border border-pub-muted rounded px-3 py-1"
          />
          <button
            type="button"
            class="text-red-400 text-sm"
            on:click={() => onRemoveInputAnswer(ai)}
            disabled={(question as InputQuestion).answer.length <= 1}
          >
            ×
          </button>
        </div>
      {/each}
      <button
        type="button"
        class="text-sm text-pub-accent hover:underline"
        on:click={onAddInputAnswer}
      >
        + Add alternative
      </button>
    </div>
  {:else if question.type === 'matching'}
    {@const mq = question as MatchingQuestion}
    <div class="space-y-4">
      <div class="space-y-2" role="group" aria-label="Items (left column)">
        <span class="block text-sm text-pub-muted">Items (left column)</span>
        {#each mq.items as _item, ii}
          <div class="flex gap-2 items-center">
            <input
              type="text"
              value={mq.items[ii]}
              on:input={(e) => {
                const val = (e.currentTarget as HTMLInputElement).value;
                onTransform((q) => {
                  const m = q as MatchingQuestion;
                  const items = [...m.items];
                  items[ii] = val;
                  return { ...q, items } as Question;
                });
              }}
              placeholder="Item {ii + 1}"
              class="flex-1 bg-pub-darker border border-pub-muted rounded px-3 py-1"
            />
            <select
              value={mq.answer[ii]}
              on:change={(e) => onSetMatchingAnswer(ii, Number((e.currentTarget as HTMLSelectElement).value))}
              class="bg-pub-darker border border-pub-muted rounded px-2 py-1 text-sm"
            >
              {#each mq.options as _opt, oi}
                <option value={oi}>{mq.options[oi] || `Option ${oi + 1}`}</option>
              {/each}
            </select>
            <button
              type="button"
              class="text-red-400 text-sm"
              on:click={() => onRemoveMatchingItem(ii)}
              disabled={mq.items.length <= 2}
            >
              ×
            </button>
          </div>
        {/each}
        <button
          type="button"
          class="text-sm text-pub-accent hover:underline"
          on:click={onAddMatchingItem}
        >
          + Add item
        </button>
      </div>
      <div class="space-y-2" role="group" aria-label="Options (right column)">
        <span class="block text-sm text-pub-muted">Options (right column)</span>
        {#each mq.options as _opt, oi}
          <div class="flex gap-2 items-center">
            <input
              type="text"
              value={mq.options[oi]}
              on:input={(e) => {
                const val = (e.currentTarget as HTMLInputElement).value;
                onTransform((q) => {
                  const m = q as MatchingQuestion;
                  const options = [...m.options];
                  options[oi] = val;
                  return { ...q, options } as Question;
                });
              }}
              placeholder="Option {oi + 1}"
              class="flex-1 bg-pub-darker border border-pub-muted rounded px-3 py-1"
            />
            <button
              type="button"
              class="text-red-400 text-sm"
              on:click={() => onRemoveMatchingOption(oi)}
              disabled={mq.options.length <= 2}
            >
              ×
            </button>
          </div>
        {/each}
        <button
          type="button"
          class="text-sm text-pub-accent hover:underline"
          on:click={onAddMatchingOption}
        >
          + Add option
        </button>
      </div>
    </div>
  {/if}
  <div class="mt-3">
    <label for="exp-{ri}-{qi}" class="block text-sm text-pub-muted mb-1">Explanation (optional)</label>
    <textarea
      id="exp-{ri}-{qi}"
      value={question.explanation ?? ''}
      on:input={(e) => onPatch({ explanation: (e.currentTarget as HTMLTextAreaElement).value || undefined })}
      placeholder="Explain why this answer is correct"
      rows="2"
      class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
    ></textarea>
  </div>
    </div>
  </div>
</div>
