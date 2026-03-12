<script context="module" lang="ts">
  export interface RevealData {
    submittedAnswerIndex?: number;
    submittedAnswerIndexes?: number[];
    submittedHotspot?: { x: number; y: number };
    submittedAnswerNumber?: number;
    submittedAnswerText?: string;
    optionCounts?: Record<number, number>;
    wasCorrect?: boolean;
  }
</script>

<script lang="ts">
  import type { Readable } from 'svelte/store';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import { getQuestionOptions } from '$lib/player/question-helpers.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { formatOptionLabel } from '$lib/utils/option-label.js';
  import type { Question, HotspotQuestion } from '$lib/types/quiz.js';

  export let question: Question | null = null;
  export let roundName: string;
  export let currentQuestionNumber: number;
  export let currentRoundQuestionTotal: number;
  export let totalTimerSeconds: number;
  export let countdown: Readable<number> | null = null;
  export let quizFilename: string | undefined = undefined;
  export let optionLabelStyle: 'letters' | 'numbers';
  export let revealData: RevealData = {};
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
    <p class="text-xl mb-4">{q.text}</p>
    {#if q.type === 'hotspot'}
      {@const hq = q as HotspotQuestion}
      {@const src = getQuestionImageSrc(hq.image, quizFilename)}
      {@const tap = revealData.submittedHotspot}
      {@const ar = hq.imageAspectRatio ?? 1}
      {@const rY = hq.answer.radiusY ?? hq.answer.radius}
      {@const rot = hq.answer.rotation ?? 0}
      {#if src}
        <div class="relative inline-block max-w-full my-4">
          <img src={src} alt="" class="max-w-full rounded-lg block" />
          <div
            class="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none rounded-full origin-center"
            style="left: {((hq.answer.x - hq.answer.radius / ar) * 100)}%; top: {((hq.answer.y - rY) * 100)}%; width: {(hq.answer.radius * 2 / ar) * 100}%; height: {(rY * 2) * 100}%; transform: rotate({rot}deg);"
          ></div>
          {#if tap}
            <div
              class="absolute w-3 h-3 rounded-full bg-pub-gold border-2 border-white pointer-events-none"
              style="left: {(tap.x * 100)}%; top: {(tap.y * 100)}%; transform: translate(-50%, -50%);"
            ></div>
          {/if}
        </div>
      {/if}
    {:else if q.image}
      {@const src = getQuestionImageSrc(q.image, quizFilename)}
      {#if src}
        <img src={src} alt="" class="max-w-full rounded-lg my-4" />
      {/if}
    {/if}
    {#if q.type === 'choice' || q.type === 'true_false'}
      {@const options = getQuestionOptions(q)}
      {@const correctIndex = q.type === 'choice' ? q.answer : (q.answer ? 0 : 1)}
      <ul class="space-y-2">
        {#each options as opt, i}
          {@const isChosen = revealData.submittedAnswerIndex === i}
          <li class="px-4 py-2 bg-pub-dark rounded {correctIndex === i ? 'ring-2 ring-green-500' : `opacity-60 ${isChosen ? 'ring-2 ring-pub-gold' : ''}`}">
            <div class="flex items-center gap-2">
              <span class="w-4 text-pub-gold" aria-hidden="true">
                {#if isChosen}
                  ●
              {/if}
              </span>
              <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                {formatOptionLabel(i, optionLabelStyle)}
              </span>
              <span class="flex-1 break-words">
                {opt} {#if correctIndex === i}(correct){/if}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {:else if q.type === 'multi_select'}
      <ul class="space-y-2">
        {#each q.options as opt, i}
          {@const isCorrect = q.answer.includes(i)}
          {@const isChosen = (revealData.submittedAnswerIndexes ?? []).includes(i)}
          <li class="px-4 py-2 bg-pub-dark rounded {isCorrect ? 'ring-2 ring-green-500' : `opacity-60 ${isChosen ? 'ring-2 ring-pub-gold' : ''}`}">
            <div class="flex items-center gap-2">
              <span class="w-4 text-pub-gold" aria-hidden="true">
                {#if isChosen}
                  ●
              {/if}
              </span>
              <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                {formatOptionLabel(i, optionLabelStyle)}
              </span>
              <span class="flex-1 break-words">
                {opt} {#if isCorrect}(correct){/if}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {:else if q.type === 'reorder'}
      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-pub-muted mb-2">Correct Order:</h3>
          <ul class="space-y-2">
            {#each q.answer as optIndex, i}
              <li class="px-4 py-2 bg-pub-dark rounded ring-2 ring-green-500">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                    {i + 1}
                  </span>
                  <span class="flex-1 break-words">{q.options[optIndex]}</span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
        {#if (revealData.submittedAnswerIndexes ?? []).length > 0}
          <div>
            <h3 class="text-sm font-semibold text-pub-muted mb-2">Your Order:</h3>
            <ul class="space-y-2 opacity-60">
              {#each revealData.submittedAnswerIndexes as optIndex, i}
                <li class="px-4 py-2 bg-pub-dark rounded {q.answer[i] === optIndex ? 'ring-1 ring-green-500/50' : 'ring-1 ring-red-500/50'}">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-muted text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {i + 1}
                    </span>
                    <span class="flex-1 break-words">{q.options[optIndex]}</span>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {:else if q.type === 'poll'}
      {@const options = getQuestionOptions(q)}
      {@const counts = revealData.optionCounts ?? {}}
      <ul class="space-y-2">
        {#each options as opt, i}
          {@const isChosen = revealData.submittedAnswerIndex === i}
          <li class="px-4 py-2 bg-pub-dark rounded {isChosen ? 'ring-2 ring-pub-gold' : 'opacity-60'}">
            <div class="flex items-center gap-2">
              <span class="w-4 text-pub-gold" aria-hidden="true">
                {#if isChosen}
                  ●
              {/if}
              </span>
              <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                {formatOptionLabel(i, optionLabelStyle)}
              </span>
              <span class="flex-1 break-words">{opt}</span>
              <span class="text-pub-gold font-semibold">{counts[i] ?? 0}</span>
            </div>
          </li>
        {/each}
      </ul>
    {:else if q.type === 'slider'}
      <div class="space-y-3">
        <p class="px-4 py-2 bg-pub-dark rounded ring-2 ring-green-500 text-pub-gold">
          Correct: {q.answer}
        </p>
        {#if revealData.submittedAnswerNumber != null}
          <p class="px-4 py-2 bg-pub-dark rounded text-pub-muted">
            You selected: {revealData.submittedAnswerNumber}
          </p>
        {/if}
      </div>
    {:else if q.type === 'input'}
      <p class="px-4 py-2 bg-pub-dark rounded ring-2 ring-pub-gold text-pub-gold">
        Correct: {q.answer.filter(Boolean).join(' / ')}
      </p>
      {#if revealData.submittedAnswerText}
        <p class="px-4 py-2 bg-pub-dark rounded text-pub-muted mt-4">
          Your response: {revealData.submittedAnswerText}
        </p>
      {/if}
    {:else if q.type === 'open_ended' || q.type === 'word_cloud'}
      {#if revealData.submittedAnswerText}
        <p class="px-4 py-2 bg-pub-dark rounded text-pub-muted mb-4">
          Your response: {revealData.submittedAnswerText}
        </p>
      {/if}
    {/if}
    {#if q.explanation?.trim()}
      <p class="mt-4 px-4 py-3 bg-pub-dark rounded text-pub-muted">
        {q.explanation}
      </p>
    {/if}
    {#if currentRoundQuestionTotal > 0}
      <p class="mt-4 text-center text-sm font-medium text-pub-muted">
        {currentQuestionNumber}/{currentRoundQuestionTotal}
      </p>
    {/if}
  {/if}
  <p class="mt-6 text-pub-muted">Waiting for next question...</p>
</div>
