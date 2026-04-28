<script lang="ts">
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import HotspotEmojiMarker from '$lib/components/HotspotEmojiMarker.svelte';
  import HostOpenEndedRevealModeration from '$lib/components/host/HostOpenEndedRevealModeration.svelte';
  import HostWordCloudRevealModeration from '$lib/components/host/HostWordCloudRevealModeration.svelte';
  import HostWrongAnswersStrip from '$lib/components/host/HostWrongAnswersStrip.svelte';
  import PollOptionsList from '$lib/components/shared/question-display/PollOptionsList.svelte';
  import RevealChoiceTrueFalseList from '$lib/components/shared/question-display/RevealChoiceTrueFalseList.svelte';
  import RevealMultiSelectList from '$lib/components/shared/question-display/RevealMultiSelectList.svelte';
  import { HOST_QUESTION_HINTS } from '$lib/constants/question-copy.js';
  import { getQuestionOptions } from '$lib/player/question-helpers.js';
  import type { SerializedState, SerializedSubmission } from '$lib/types/game.js';
  import type { Question } from '$lib/types/quiz.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { formatOptionLabel } from '$lib/utils/option-label.js';
  import type { OptionLabelStyle } from '$lib/utils/option-label.js';
  import { getQuestionDisplayOptionIndices } from '$lib/utils/shuffle.js';

  export let state: SerializedState;
  export let roomId: string;
  export let currentQuestion: Question | null = null;
  export let currentRoundQuestionTotal = 0;
  export let currentQuestionNumber = 0;
  export let liveSubmittedCount = 0;
  export let liveOptionCounts: Map<number, number> = new Map();
  export let liveHotspotSubmissions: SerializedSubmission[] | Array<{ playerId: string; answerX: number; answerY: number }> = [];
  export let optionLabelStyle: OptionLabelStyle = 'letters';
  export let totalTimerSeconds = 30;
  export let showCountdown = false;
  export let countdownSecondsRemaining = 0;
  export let hostActionClass = '';
  export let hostActionLabel = '';
  export let visibilityPending: string | null = null;
  export let onNext: () => void;
  export let onToggleSubmissionVisibility: (playerId: string, questionId: string, visible: boolean) => void;
  export let onToggleWordVisibility: (questionId: string, word: string, visible: boolean) => void;
  export let onOverride: (playerId: string, questionId: string, delta: number) => void;
  export let getDisplay: (wa: {
    playerId: string;
    questionId: string;
    answer: string | number | number[];
  }) => string;
</script>

<div class="bg-pub-darker rounded-lg p-4 sm:p-6">
  {#key `${state?.currentRoundIndex ?? 0}-${state?.currentQuestionIndex ?? 0}`}
    {#if currentQuestion}
      {@const q = currentQuestion}
      <div class="flex items-start justify-between gap-4 mb-2">
        <p class="text-pub-gold text-base font-semibold">
          {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
        </p>
        {#if showCountdown}
          <CountdownPie secondsRemaining={countdownSecondsRemaining} totalSeconds={totalTimerSeconds} />
        {/if}
      </div>
      <p class="text-xl mb-6">{q.text}</p>
      {#if q.type === 'hotspot'}
        {@const hq = q}
        {@const src = getQuestionImageSrc(hq.image, state?.quizFilename)}
        {@const ar = hq.imageAspectRatio ?? 1}
        {@const rY = hq.answer.radiusY ?? hq.answer.radius}
        {@const rot = hq.answer.rotation ?? 0}
        {#if src}
          <div class="relative inline-block max-w-full my-4">
            <img src={src} alt="" class="max-w-full rounded-lg block" />
            {#if state?.type === 'RevealAnswer'}
              <div
                class="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none rounded-full origin-center"
                style="left: {((hq.answer.x - hq.answer.radius / ar) * 100)}%; top: {((hq.answer.y - rY) * 100)}%; width: {(hq.answer.radius * 2 / ar) * 100}%; height: {(rY * 2) * 100}%; transform: rotate({rot}deg);"
              ></div>
            {/if}
            {#each liveHotspotSubmissions as sub}
              {@const player = (state?.players ?? []).find((p) => p.id === sub.playerId)}
              {@const isWrong = state?.wrongAnswers?.some((w) => w.playerId === sub.playerId && w.questionId === q.id)}
              <HotspotEmojiMarker
                x={sub.answerX!}
                y={sub.answerY!}
                emoji={player?.emoji ?? '?'}
                name={player?.name ?? 'Unknown'}
                {isWrong}
                showCorrectness={state?.type === 'RevealAnswer'}
              />
            {/each}
          </div>
        {/if}
      {:else if q.image}
        {@const src = getQuestionImageSrc(q.image, state?.quizFilename)}
        {#if src}
          <img src={src} alt="" class="max-w-full rounded-lg my-4" />
        {/if}
      {/if}
      {#if HOST_QUESTION_HINTS[q.type]}
        <p class="text-sm text-pub-muted mb-4">{HOST_QUESTION_HINTS[q.type]}</p>
      {/if}
      {#if q.type === 'choice' || q.type === 'true_false'}
        {@const options = getQuestionOptions(q)}
        {@const optionIndices = q.type === 'true_false' ? [0, 1] : getQuestionDisplayOptionIndices(q, roomId)}
        {#if state?.type === 'RevealAnswer'}
          {@const correctIndex = q.type === 'choice' ? q.answer : q.answer ? 0 : 1}
          <RevealChoiceTrueFalseList {options} {correctIndex} {optionLabelStyle} {optionIndices} />
        {:else}
          <ul class="space-y-2">
            {#each optionIndices as optIndex, i}
              {@const correctIndex = q.type === 'choice' ? q.answer : q.answer ? 0 : 1}
              <li class="px-4 py-2 bg-pub-dark rounded {correctIndex === optIndex ? 'ring-2 ring-green-500' : ''}">
                <div class="flex items-center gap-2">
                  <span
                    class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
                  >
                    {formatOptionLabel(i, optionLabelStyle)}
                  </span>
                  <span class="flex-1 break-words">{options[optIndex]}</span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if q.type === 'multi_select'}
        {@const counts = liveOptionCounts}
        {@const optionIndices = getQuestionDisplayOptionIndices(q, roomId)}
        {#if state?.type === 'RevealAnswer'}
          <RevealMultiSelectList options={q.options} correctIndices={q.answer} {counts} {optionLabelStyle} {optionIndices} />
        {:else}
          <ul class="space-y-2">
            {#each optionIndices as optIndex, i}
              <li class="px-4 py-2 bg-pub-dark rounded">
                <div class="flex items-center gap-2">
                  <span
                    class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
                  >
                    {formatOptionLabel(i, optionLabelStyle)}
                  </span>
                  <span class="flex-1 break-words">{q.options[optIndex]}</span>
                  <span class="text-pub-gold font-semibold">{counts.get(optIndex) ?? 0}</span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if q.type === 'reorder'}
        <div class="space-y-4">
          <div>
            {#if state?.type === 'RevealAnswer'}
              <h3 class="text-sm font-semibold text-pub-muted mb-2">Correct Order:</h3>
            {/if}
            <ul class="space-y-2 {state?.type !== 'RevealAnswer' ? 'opacity-60' : ''}">
              {#each (state?.type === 'RevealAnswer' ? q.answer : getQuestionDisplayOptionIndices(q, roomId)) as optIndex, i}
                <li class="px-4 py-2 bg-pub-dark rounded {state?.type === 'RevealAnswer' ? 'ring-2 ring-green-500' : ''}">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {state?.type === 'RevealAnswer' ? i + 1 : formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">{q.options[optIndex]}</span>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </div>
      {:else if q.type === 'click_to_match' || q.type === 'drag_and_drop'}
        <div class="space-y-4">
          {#if state?.type === 'RevealAnswer'}
            <h3 class="text-sm font-semibold text-pub-muted mb-2">Correct Pairs:</h3>
          {/if}
          <div class="flex gap-4 flex-col sm:flex-row">
            <div class="flex-1">
              <p class="text-sm font-medium text-pub-muted mb-2">Items</p>
              <ul class="space-y-2">
                {#each q.items as item, i}
                  <li class="px-4 py-2 bg-pub-dark rounded {state?.type === 'RevealAnswer' ? 'ring-2 ring-green-500' : ''}">
                    <span class="font-medium">{item}</span>
                    {#if state?.type === 'RevealAnswer'}
                      <span class="block text-pub-gold text-sm mt-1">→ {q.options[q.answer[i]]}</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
            {#if state?.type !== 'RevealAnswer'}
              <div class="flex-1">
                <p class="text-sm font-medium text-pub-muted mb-2">Options</p>
                <ul class="space-y-2 opacity-60">
                  {#each getQuestionDisplayOptionIndices(q, roomId) as optIndex}
                    <li class="px-4 py-2 bg-pub-dark rounded">
                      <span class="break-words">{q.options[optIndex]}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        </div>
      {:else if q.type === 'poll'}
        {@const counts = liveOptionCounts}
        <PollOptionsList
          options={q.options}
          {optionLabelStyle}
          showCounts={state?.type === 'RevealAnswer'}
          {counts}
          optionIndices={getQuestionDisplayOptionIndices(q, roomId)}
          itemRoundedClass="rounded"
        />
      {:else if q.type === 'slider'}
        <div class="space-y-3">
          <p class="px-4 py-2 bg-pub-dark rounded text-pub-muted">
            Range: {q.min} to {q.max} in steps of {q.step}
          </p>
          {#if state?.type === 'RevealAnswer'}
            <p class="px-4 py-2 bg-pub-dark rounded ring-2 ring-green-500 text-pub-gold">
              Correct: {q.answer}
            </p>
          {/if}
        </div>
      {:else if q.type === 'hotspot'}
        <!-- Hotspot: image with circle overlay shown above -->
      {:else if q.type === 'input' && state?.type === 'RevealAnswer'}
        <p class="px-4 py-2 bg-pub-dark rounded ring-2 ring-pub-gold text-pub-gold">
          Correct: {q.answer.filter(Boolean).join(' / ')}
        </p>
      {:else if q.type === 'open_ended' && state?.type === 'RevealAnswer'}
        <HostOpenEndedRevealModeration
          {state}
          questionId={q.id}
          {visibilityPending}
          onToggleSubmissionVisibility={onToggleSubmissionVisibility}
        />
      {:else if q.type === 'word_cloud' && state?.type === 'RevealAnswer'}
        <HostWordCloudRevealModeration
          {state}
          questionId={q.id}
          {visibilityPending}
          onToggleWordVisibility={onToggleWordVisibility}
        />
      {/if}
      {#if state?.type === 'RevealAnswer' && q.explanation?.trim()}
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
  {/key}

  {#if state?.type === 'Question' && state.submissions}
    <p class="text-pub-muted text-sm mt-4">
      {liveSubmittedCount} of {(state.players ?? []).length} submitted
    </p>
  {/if}

  <div class="flex gap-4 mt-6 flex-wrap items-center">
    <button class="px-4 py-2 {hostActionClass} rounded-lg font-medium hover:opacity-90 ml-auto" onclick={onNext}>
      {hostActionLabel}
    </button>
  </div>

  <HostWrongAnswersStrip {state} {currentQuestion} {getDisplay} onOverride={onOverride} />
</div>
