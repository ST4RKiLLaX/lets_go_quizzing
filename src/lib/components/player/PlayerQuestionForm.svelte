<script lang="ts">
  import type { Readable } from 'svelte/store';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import { getQuestionOptions } from '$lib/player/question-helpers.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { formatOptionLabel } from '$lib/utils/option-label.js';
  import type { Question, HotspotQuestion } from '$lib/types/quiz.js';

  export let question: Question;
  export let roundName: string;
  export let currentQuestionNumber: number;
  export let currentRoundQuestionTotal: number;
  export let totalTimerSeconds: number;
  export let countdown: Readable<number> | null = null;
  export let quizFilename: string | undefined = undefined;
  export let optionLabelStyle: 'letters' | 'numbers';
  export let questionTimeExpired: boolean;
  export let hasAnsweredCurrentQuestion: boolean;
  export let showTimesUpMessage: boolean;
  export let submitError: string;

  export let hasSubmitted: (questionId: string) => boolean;
  export let getSubmittedAnswerIndex: (questionId: string) => number | undefined;
  export let getSubmittedAnswerIndexes: (questionId: string) => number[];
  export let getSubmittedHotspot: (questionId: string) => { x: number; y: number } | undefined;
  export let isHotspotSubmitted: (questionId: string) => boolean;
  export let isMultiSelectSubmitted: (questionId: string) => boolean;
  export let isReorderSubmitted: (questionId: string) => boolean;
  export let isSliderSubmitted: (questionId: string) => boolean;
  export let isInputSubmitted: (questionId: string) => boolean;
  export let getSelectedOptionLabel: (q: Question) => string;
  export let getSelectedOptionLabels: (q: Question) => string[];
  export let getSubmittedAnswerNumber: (questionId: string) => number | undefined;

  export let selectedAnswer: { questionId: string; answerIndex: number } | null;
  export let selectedMultiSelect: { questionId: string; answerIndexes: number[] } | null;

  export let multiSelectDraft: number[] = [];
  export let reorderDraft: number[] = [];
  export let sliderAnswer: number | null = null;
  export let inputAnswer = '';

  export let submitChoice: (questionId: string, answerIndex: number) => void;
  export let submitMultiSelect: (questionId: string, answerIndexes: number[]) => void;
  export let submitReorder: (questionId: string, answerIndexes: number[]) => void;
  export let submitSlider: (questionId: string, answerNumber: number) => void;
  export let submitHotspot: (questionId: string, x: number, y: number) => void;
  export let submitInput: (questionId: string, answerText: string) => void;
  export let toggleMultiSelectDraft: (optionIndex: number) => void;
</script>

<div class="bg-pub-darker rounded-lg p-6">
  {#if question}
    {@const q = question}
    <div class="flex items-start justify-between gap-4 mb-2">
      <p class="text-pub-gold text-base font-semibold">{roundName}</p>
      {#if countdown}
        <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
      {/if}
    </div>
    <p class="text-xl mb-6">{q.text}</p>
    {#if q.type === 'hotspot'}
      {@const hq = q as HotspotQuestion}
      {@const src = getQuestionImageSrc(hq.image, quizFilename)}
      {@const tap = getSubmittedHotspot(q.id)}
      {#if src}
        <div
          class="relative inline-block max-w-full cursor-crosshair my-4"
          role="button"
          tabindex="0"
          onclick={(e) => {
            const img = e.currentTarget.querySelector('img');
            if (!img || isHotspotSubmitted(q.id) || questionTimeExpired) return;
            const rect = img.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            submitHotspot(q.id, x, y);
          }}
          ontouchend={(e) => {
            const img = e.currentTarget.querySelector('img');
            if (!img || isHotspotSubmitted(q.id) || questionTimeExpired) return;
            const touch = e.changedTouches?.[0];
            if (!touch) return;
            const rect = img.getBoundingClientRect();
            const x = (touch.clientX - rect.left) / rect.width;
            const y = (touch.clientY - rect.top) / rect.height;
            submitHotspot(q.id, x, y);
          }}
          onkeydown={(e) => e.key === 'Enter' && e.currentTarget.click()}
        >
          <img
            src={src}
            alt=""
            class="max-w-full rounded-lg block"
            onerror={(e) => {
              const img = e.target;
              if (img instanceof HTMLImageElement) {
                img.style.display = 'none';
                const fallback = img.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = 'block';
              }
            }}
          />
          <p class="text-pub-muted text-sm py-4" style="display: none;">
            Image could not be loaded. Please try again or contact the host.
          </p>
          {#if tap}
            <div
              class="absolute w-3 h-3 rounded-full bg-pub-gold border-2 border-white pointer-events-none"
              style="left: {(tap.x * 100)}%; top: {(tap.y * 100)}%; transform: translate(-50%, -50%);"
            ></div>
          {/if}
        </div>
        <p class="text-sm text-pub-muted mb-2">Tap the correct area on the image</p>
      {:else}
        <p class="text-pub-muted text-sm py-4">Image unavailable for this question.</p>
      {/if}
    {:else if q.image}
      {@const src = getQuestionImageSrc(q.image, quizFilename)}
      {#if src}
        <img src={src} alt="" class="max-w-full rounded-lg my-4" />
      {/if}
    {/if}
    {#if q.type === 'choice' || q.type === 'true_false' || q.type === 'poll'}
      {@const options = getQuestionOptions(q)}
      <div class="space-y-2">
        {#each options as opt, i}
          {@const isChosen = (hasSubmitted(q.id) && getSubmittedAnswerIndex(q.id) === i) || (selectedAnswer?.questionId === q.id && selectedAnswer?.answerIndex === i)}
          <button
            class="w-full px-4 py-3 bg-pub-dark rounded-lg text-left hover:bg-pub-accent/20 disabled:opacity-50 flex items-center gap-2 {isChosen ? 'ring-2 ring-pub-gold' : ''} {questionTimeExpired ? 'opacity-60' : ''}"
            disabled={hasSubmitted(q.id) || selectedAnswer?.questionId === q.id || questionTimeExpired}
            onclick={() => submitChoice(q.id, i)}
          >
            <span class="w-4 text-pub-gold" aria-hidden="true">
              {#if isChosen}
                ●
            {/if}
            </span>
            <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
              {formatOptionLabel(i, optionLabelStyle)}
            </span>
            <span class="flex-1 break-words">{opt}</span>
          </button>
        {/each}
      </div>
    {:else if q.type === 'multi_select'}
      <div class="space-y-2">
        {#each q.options as opt, i}
          {@const isChosen = getSubmittedAnswerIndexes(q.id).includes(i) || (selectedMultiSelect?.questionId === q.id ? selectedMultiSelect.answerIndexes.includes(i) : multiSelectDraft.includes(i))}
          <button
            class="w-full px-4 py-3 bg-pub-dark rounded-lg text-left hover:bg-pub-accent/20 disabled:opacity-50 flex items-center gap-2 {isChosen ? 'ring-2 ring-pub-gold' : ''} {questionTimeExpired ? 'opacity-60' : ''}"
            disabled={isMultiSelectSubmitted(q.id) || questionTimeExpired}
            onclick={() => toggleMultiSelectDraft(i)}
          >
            <span class="w-4 text-pub-gold" aria-hidden="true">
              {#if isChosen}
                ●
            {/if}
            </span>
            <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
              {formatOptionLabel(i, optionLabelStyle)}
            </span>
            <span class="flex-1 break-words">{opt}</span>
          </button>
        {/each}
        <button
          type="button"
          class="mt-2 px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          disabled={isMultiSelectSubmitted(q.id) || multiSelectDraft.length === 0 || questionTimeExpired}
          onclick={() => submitMultiSelect(q.id, multiSelectDraft)}
        >
          Submit
        </button>
      </div>
    {:else if q.type === 'reorder'}
      <div class="space-y-2">
        <p class="text-sm text-pub-muted mb-4">Use arrows to reorder items</p>
        {#each reorderDraft as optIndex, currentPos}
          <div class="flex items-center gap-2 bg-pub-dark rounded-lg p-2 {questionTimeExpired || isReorderSubmitted(q.id) ? 'opacity-60' : ''}">
            <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center leading-none">
              {currentPos + 1}
            </span>
            <span class="flex-1 break-words px-2">{q.options[optIndex]}</span>
            {#if !isReorderSubmitted(q.id) && !questionTimeExpired}
              <div class="flex flex-col gap-1">
                <button
                  type="button"
                  class="w-8 h-8 flex items-center justify-center bg-pub-darker rounded hover:bg-pub-accent/20 disabled:opacity-30 disabled:hover:bg-pub-darker"
                  disabled={currentPos === 0}
                  onclick={() => {
                    if (currentPos > 0) {
                      const newDraft = [...reorderDraft];
                      [newDraft[currentPos - 1], newDraft[currentPos]] = [newDraft[currentPos], newDraft[currentPos - 1]];
                      reorderDraft = newDraft;
                    }
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="w-8 h-8 flex items-center justify-center bg-pub-darker rounded hover:bg-pub-accent/20 disabled:opacity-30 disabled:hover:bg-pub-darker"
                  disabled={currentPos === reorderDraft.length - 1}
                  onclick={() => {
                    if (currentPos < reorderDraft.length - 1) {
                      const newDraft = [...reorderDraft];
                      [newDraft[currentPos + 1], newDraft[currentPos]] = [newDraft[currentPos], newDraft[currentPos + 1]];
                      reorderDraft = newDraft;
                    }
                  }}
                >
                  ↓
                </button>
              </div>
            {/if}
          </div>
        {/each}
        <button
          type="button"
          class="mt-4 px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          disabled={isReorderSubmitted(q.id) || questionTimeExpired}
          onclick={() => submitReorder(q.id, reorderDraft)}
        >
          Submit Ordering
        </button>
      </div>
    {:else if q.type === 'slider'}
      <div class="space-y-4">
        <div class="px-4 py-4 bg-pub-dark rounded-lg {isSliderSubmitted(q.id) ? 'opacity-60' : ''}">
          <div class="flex items-center justify-between gap-4 mb-3">
            <span class="text-sm text-pub-muted">{q.min}</span>
            <span class="text-lg font-semibold text-pub-gold">{sliderAnswer ?? q.min}</span>
            <span class="text-sm text-pub-muted">{q.max}</span>
          </div>
          <input
            type="range"
            min={q.min}
            max={q.max}
            step={q.step}
            bind:value={sliderAnswer}
            class="w-full"
            disabled={isSliderSubmitted(q.id) || questionTimeExpired}
          />
        </div>
        <button
          type="button"
          class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          disabled={isSliderSubmitted(q.id) || sliderAnswer == null || questionTimeExpired}
          onclick={() => submitSlider(q.id, Number(sliderAnswer))}
        >
          Submit
        </button>
      </div>
    {:else if q.type === 'input' || q.type === 'open_ended' || q.type === 'word_cloud'}
      {@const maxChars = q.type === 'word_cloud' ? 75 : q.type === 'input' ? 75 : 200}
      {@const atLimit = inputAnswer.length >= maxChars}
      <form
        class="flex flex-col gap-2"
        onsubmit={(e) => {
          e.preventDefault();
          if (inputAnswer.trim() && !isInputSubmitted(q.id) && !questionTimeExpired) {
            submitInput(q.id, inputAnswer.trim());
          }
        }}
      >
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={inputAnswer}
            placeholder="Your answer"
            maxlength={maxChars}
            class="flex-1 bg-pub-dark border rounded-lg px-4 py-2 {atLimit ? 'border-amber-500' : 'border-pub-muted'} {isInputSubmitted(q.id) ? 'opacity-60' : ''}"
            disabled={isInputSubmitted(q.id) || questionTimeExpired}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                if (inputAnswer.trim() && !isInputSubmitted(q.id) && !questionTimeExpired) {
                  submitInput(q.id, inputAnswer.trim());
                }
              }
            }}
          />
          <button
            type="submit"
            class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            disabled={isInputSubmitted(q.id) || !inputAnswer.trim() || questionTimeExpired}
          >
            Submit
          </button>
        </div>
        <p class="text-sm {atLimit ? 'text-amber-500' : 'text-pub-muted'}">
          {inputAnswer.length}/{maxChars} characters
          {#if atLimit}
            <span class="font-medium"> — at limit</span>
          {/if}
        </p>
      </form>
    {/if}
    {#if currentRoundQuestionTotal > 0}
      <p class="mt-4 text-center text-sm font-medium text-pub-muted">
        {currentQuestionNumber}/{currentRoundQuestionTotal}
      </p>
    {/if}
    {#if hasAnsweredCurrentQuestion && q.type !== 'input' && q.type !== 'open_ended' && q.type !== 'word_cloud'}
      <p class="mt-4 text-pub-gold">Answer submitted!</p>
      {#if q.type === 'hotspot' && getSubmittedHotspot(q.id)}
        <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
          You tapped at ({Math.round(getSubmittedHotspot(q.id)!.x * 100)}%, {Math.round(getSubmittedHotspot(q.id)!.y * 100)}%)
        </p>
      {:else if (q.type === 'choice' || q.type === 'true_false' || q.type === 'poll') && getSelectedOptionLabel(q)}
        <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
          You selected: {getSelectedOptionLabel(q)}
        </p>
      {:else if q.type === 'multi_select' && getSelectedOptionLabels(q).length > 0}
        <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
          You selected: {getSelectedOptionLabels(q).join(', ')}
        </p>
      {:else if q.type === 'reorder'}
        <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
          Your order: {getSelectedOptionLabels(q).join(', ')}
        </p>
      {:else if q.type === 'slider' && getSubmittedAnswerNumber(q.id) != null}
        <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
          You selected: {getSubmittedAnswerNumber(q.id)}
        </p>
      {/if}
    {:else if showTimesUpMessage}
      <p class="mt-4 text-red-400">Time's Up!</p>
    {:else if submitError}
      <p class="mt-4 text-red-500">{submitError}</p>
    {/if}
  {/if}
</div>
