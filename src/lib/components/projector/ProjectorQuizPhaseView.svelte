<script lang="ts">
  import type { Readable } from 'svelte/store';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import HotspotEmojiMarker from '$lib/components/HotspotEmojiMarker.svelte';
  import SliderDisplay from '$lib/components/SliderDisplay.svelte';
  import type { SerializedState } from '$lib/types/game.js';
  import type { HotspotQuestion, Question } from '$lib/types/quiz.js';
  import { getQuestionOptions, getOptionCounts } from '$lib/player/question-helpers.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { getShuffledReorderIndices } from '$lib/utils/shuffle.js';
  import { formatOptionLabel } from '$lib/utils/option-label.js';
  import { getWordCloudTokens } from '$lib/utils/word-cloud.js';
  import RevealChoiceTrueFalseList from '$lib/components/shared/question-display/RevealChoiceTrueFalseList.svelte';
  import RevealMultiSelectList from '$lib/components/shared/question-display/RevealMultiSelectList.svelte';
  import PollOptionsList from '$lib/components/shared/question-display/PollOptionsList.svelte';

  /** `question` = live prompt; `reveal` = answers and counts */
  export let phase: 'question' | 'reveal';
  export let state: SerializedState;
  export let currentQuestion: Question | null;
  export let optionLabelStyle: 'letters' | 'numbers';
  export let totalTimerSeconds: number;
  export let countdown: Readable<number> | null;
  export let currentRoundQuestionTotal: number;
  export let currentQuestionNumber: number;

  function getAnsweredInOrder(): Array<{ emoji: string; name: string }> {
    const q = currentQuestion;
    if (!q || !state?.submissions) return [];
    const submitted = state.submissions.filter((s) => s.questionId === q.id);
    const players = state.players ?? [];
    return submitted.map((s) => {
      const p = players.find((x) => x.id === s.playerId);
      return p ? { emoji: p.emoji, name: p.name } : { emoji: '?', name: 'Unknown' };
    });
  }

  function getCorrectAnswersInRankOrder(): Array<{
    emoji: string;
    name: string;
    rank: number;
    points: number;
  }> {
    const q = currentQuestion;
    if (!q || !state?.submissions || !state?.wrongAnswers) return [];
    const wrongPlayerIds = new Set(
      state.wrongAnswers.filter((w) => w.questionId === q.id).map((w) => w.playerId)
    );
    const correct = state.submissions
      .filter((s) => s.questionId === q.id && !wrongPlayerIds.has(s.playerId))
      .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
    const weight = (q as { points?: number }).points ?? 1;
    const maxPts = (state.quiz?.meta?.ranked_max_points ?? 100) * weight;
    const minPts = (state.quiz?.meta?.ranked_min_points ?? 10) * weight;
    const players = state.players ?? [];
    let currentRank = 1;
    let prevTime = -1;
    return correct.map((s, i) => {
      if (s.submittedAt !== prevTime) {
        currentRank = i + 1;
        prevTime = s.submittedAt ?? -1;
      }
      const pts =
        correct.length === 1
          ? maxPts
          : Math.round(maxPts - ((currentRank - 1) * (maxPts - minPts)) / (correct.length - 1));
      const p = players.find((x) => x.id === s.playerId);
      return {
        emoji: p?.emoji ?? '?',
        name: p?.name ?? 'Unknown',
        rank: currentRank,
        points: pts,
      };
    });
  }

  $: answeredList = phase === 'question' ? getAnsweredInOrder() : [];
  $: rankedCorrectList =
    phase === 'reveal' && (state.quiz?.meta?.scoring_mode ?? 'standard') === 'ranked'
      ? getCorrectAnswersInRankOrder()
      : [];

  $: q = currentQuestion;
</script>

<div class="bg-pub-darker rounded-lg p-6" data-question-id={currentQuestion?.id ?? undefined}>
  {#key `${state.currentRoundIndex}-${state.currentQuestionIndex}-${phase}-${phase === 'question' ? (state.submissions?.length ?? 0) : 'r'}-${currentQuestion?.id ?? 'none'}`}
    {@const qq = q}
    {#if qq}
    <div class="flex items-start justify-between gap-6 mb-2">
      <p class="text-pub-gold text-base font-semibold">
        {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
      </p>
      {#if phase === 'question'}
        {#if state.timerEndsAt && countdown}
          <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
        {/if}
      {:else if countdown}
        <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
      {/if}
    </div>
    <p class="text-xl {phase === 'reveal' ? 'mb-4' : 'mb-6'}">{qq.text}</p>

    {#if qq.type === 'hotspot'}
      {@const hq = qq as HotspotQuestion}
      {@const src = getQuestionImageSrc(hq.image, state?.quizFilename)}
      {#if phase === 'question'}
        {#if src}
          <img src={src} alt="" class="max-w-full rounded-lg my-4" />
          <p class="text-xl text-pub-muted text-center mt-4">Tap the correct area</p>
        {/if}
      {:else if src}
        {@const ar = hq.imageAspectRatio ?? 1}
        {@const rY = hq.answer.radiusY ?? hq.answer.radius}
        {@const rot = hq.answer.rotation ?? 0}
        {@const hotspotSubs = (state?.submissions ?? []).filter(
          (s) =>
            s.questionId === qq.id &&
            s.answerX != null &&
            s.answerY != null &&
            s.visibility !== 'blocked' &&
            !s.projectorHiddenByHost
        )}
        <div class="relative inline-block max-w-full my-4">
          <img src={src} alt="" class="max-w-full rounded-lg block" />
          <div
            class="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none rounded-full origin-center"
            style="left: {((hq.answer.x - hq.answer.radius / ar) * 100)}%; top: {((hq.answer.y - rY) * 100)}%; width: {(hq.answer.radius * 2 / ar) * 100}%; height: {(rY * 2) * 100}%; transform: rotate({rot}deg);"
          ></div>
          {#each hotspotSubs as sub}
            {@const player = (state?.players ?? []).find((p) => p.id === sub.playerId)}
            {@const isWrong = (state?.wrongAnswers ?? []).some(
              (w) => w.playerId === sub.playerId && w.questionId === qq.id
            )}
            <HotspotEmojiMarker
              x={sub.answerX!}
              y={sub.answerY!}
              emoji={player?.emoji ?? '?'}
              name={player?.name ?? 'Unknown'}
              {isWrong}
            />
          {/each}
        </div>
      {/if}
    {:else if qq.image}
      {@const imgSrc = getQuestionImageSrc(qq.image, state?.quizFilename)}
      {#if imgSrc}
        <img src={imgSrc} alt="" class="max-w-full rounded-lg my-4" />
      {/if}
    {/if}

    {#if phase === 'question'}
      {#if qq.type === 'choice' || qq.type === 'true_false'}
        {@const options = getQuestionOptions(qq)}
        <ul class="space-y-2">
          {#each options as opt, i}
            <li class="px-4 py-2 bg-pub-dark rounded-lg">
              <div class="flex items-center gap-2">
                <span
                  class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
                >
                  {formatOptionLabel(i, optionLabelStyle)}
                </span>
                <span class="flex-1 break-words">{opt}</span>
              </div>
            </li>
          {/each}
        </ul>
      {:else if qq.type === 'poll'}
        <PollOptionsList options={qq.options} {optionLabelStyle} showCounts={false} />
      {:else if qq.type === 'multi_select'}
        <ul class="space-y-2">
          {#each qq.options as opt, i}
            <li class="px-4 py-2 bg-pub-dark rounded-lg">
              <div class="flex items-center gap-2">
                <span
                  class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
                >
                  {formatOptionLabel(i, optionLabelStyle)}
                </span>
                <span class="flex-1 break-words">{opt}</span>
              </div>
            </li>
          {/each}
        </ul>
      {:else if qq.type === 'reorder'}
        <ul class="space-y-2">
          {#each getShuffledReorderIndices(qq.id, qq.options.length) as optIndex, i}
            <li class="px-4 py-2 bg-pub-dark rounded-lg opacity-80">
              <div class="flex items-center gap-2">
                <span
                  class="w-7 h-7 rounded-full bg-pub-muted text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
                >
                  {formatOptionLabel(i, optionLabelStyle)}
                </span>
                <span class="flex-1 break-words">{qq.options[optIndex]}</span>
              </div>
            </li>
          {/each}
        </ul>
        <p class="mt-4 text-xl text-pub-muted text-center">Arrange these in the correct order</p>
      {:else if qq.type === 'matching'}
        <div class="flex gap-4 flex-col sm:flex-row">
          <div class="flex-1">
            <p class="text-sm font-medium text-pub-muted mb-2">Items</p>
            <ul class="space-y-2">
              {#each qq.items as item}
                <li class="px-4 py-2 bg-pub-dark rounded-lg opacity-80">
                  <span class="break-words">{item}</span>
                </li>
              {/each}
            </ul>
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium text-pub-muted mb-2">Options</p>
            <ul class="space-y-2">
              {#each getShuffledReorderIndices(qq.id + ':options', qq.options.length) as optIndex}
                <li class="px-4 py-2 bg-pub-dark rounded-lg opacity-80">
                  <span class="break-words">{qq.options[optIndex]}</span>
                </li>
              {/each}
            </ul>
          </div>
        </div>
        <p class="mt-4 text-xl text-pub-muted text-center">Match items to options</p>
      {:else if qq.type === 'slider'}
        <SliderDisplay min={qq.min} max={qq.max} step={qq.step} mode="idle" />
      {:else if qq.type === 'input'}
        <p class="text-xl text-pub-muted">Fill in the blank</p>
      {:else if qq.type === 'open_ended'}
        <p class="text-xl text-pub-muted">Type your response</p>
      {:else if qq.type === 'word_cloud'}
        <p class="text-xl text-pub-muted">Type a short word or phrase</p>
      {/if}
    {:else}
      {#if qq.type === 'choice' || qq.type === 'true_false'}
        {@const options = getQuestionOptions(qq)}
        {@const correctIndex = qq.type === 'choice' ? qq.answer : qq.answer ? 0 : 1}
        <RevealChoiceTrueFalseList {options} {correctIndex} {optionLabelStyle} />
      {:else if qq.type === 'multi_select'}
        {@const counts = getOptionCounts(state?.submissions ?? [], qq.id)}
        <RevealMultiSelectList
          options={qq.options}
          correctIndices={qq.answer}
          {counts}
          {optionLabelStyle}
        />
      {:else if qq.type === 'reorder'}
        <div class="space-y-2">
          <h3 class="text-sm font-semibold text-pub-muted mb-2 text-center">Correct Order</h3>
          <ul class="space-y-2">
            {#each qq.answer as optIndex, i}
              <li class="px-4 py-2 bg-pub-dark rounded-lg ring-2 ring-green-500">
                <div class="flex items-center gap-2">
                  <span
                    class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
                  >
                    {i + 1}
                  </span>
                  <span class="flex-1 break-words">{qq.options[optIndex]}</span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {:else if qq.type === 'matching'}
        <div class="space-y-2">
          <h3 class="text-sm font-semibold text-pub-muted mb-2 text-center">Correct Pairs</h3>
          <ul class="space-y-2">
            {#each qq.items as item, i}
              <li class="px-4 py-2 bg-pub-dark rounded-lg ring-2 ring-green-500">
                <span class="font-medium">{item}</span>
                <span class="block text-pub-gold text-sm mt-1">→ {qq.options[qq.answer[i]]}</span>
              </li>
            {/each}
          </ul>
        </div>
      {:else if qq.type === 'poll'}
        {@const counts = getOptionCounts(state?.submissions ?? [], qq.id)}
        <PollOptionsList options={qq.options} {optionLabelStyle} showCounts={true} {counts} />
      {:else if qq.type === 'slider'}
        {@const sliderSubs = (state.submissions ?? []).filter(
          (s) =>
            s.questionId === qq.id &&
            s.answerNumber != null &&
            s.visibility !== 'blocked' &&
            !s.projectorHiddenByHost
        )}
        {@const wrongPlayerIds = new Set(
          (state.wrongAnswers ?? []).filter((w) => w.questionId === qq.id).map((w) => w.playerId)
        )}
        <SliderDisplay
          min={qq.min}
          max={qq.max}
          step={qq.step}
          mode="reveal"
          value={qq.answer}
          submissions={sliderSubs.map((s) => ({
            emoji: (state.players ?? []).find((p) => p.id === s.playerId)?.emoji ?? '?',
            answerNumber: s.answerNumber!,
            isWrong: wrongPlayerIds.has(s.playerId),
          }))}
          showCorrect={true}
        />
      {:else if qq.type === 'input'}
        <p class="px-4 py-2 bg-pub-dark rounded-lg ring-2 ring-pub-gold text-pub-gold">
          Correct: {qq.answer.filter(Boolean).join(' / ')}
        </p>
      {:else if qq.type === 'open_ended'}
        {@const visibleSubs = (state.submissions ?? []).filter(
          (s) => s.questionId === qq.id && s.visibility !== 'blocked' && !s.projectorHiddenByHost
        )}
        <div class="space-y-3 mt-4">
          <h3 class="text-lg font-semibold text-pub-muted">Responses:</h3>
          <ul class="space-y-2">
            {#each visibleSubs as sub}
              {@const player = state.players?.find((p) => p.id === sub.playerId)}
              <li class="px-4 py-3 bg-pub-dark rounded-lg text-lg">
                <span class="text-pub-muted mr-3">{player?.emoji} {player?.name}:</span>
                {sub.answerText}
              </li>
            {/each}
          </ul>
        </div>
      {:else if qq.type === 'word_cloud'}
        {@const hiddenWords = new Set((state.hiddenWordsByQuestion ?? {})[qq.id] ?? [])}
        {@const wordCounts = (state.submissions ?? [])
          .filter((s) => s.questionId === qq.id && s.visibility !== 'blocked')
          .reduce((acc, s) => {
            for (const token of getWordCloudTokens(s.answerText ?? '')) {
              if (!hiddenWords.has(token)) acc.set(token, (acc.get(token) || 0) + 1);
            }
            return acc;
          }, new Map<string, number>())}
        <div
          class="mt-4 flex flex-wrap gap-4 justify-center items-center p-8 bg-pub-dark rounded-lg min-h-[200px]"
        >
          {#each Array.from(wordCounts).sort((a, b) => b[1] - a[1]) as [word, count]}
            <span
              style="font-size: {Math.max(1.5, Math.min(5, 1 + count * 0.5))}rem; opacity: {Math.min(
                1,
                0.4 + count * 0.2
              )}"
              class="text-pub-gold font-bold leading-none inline-block"
            >
              {word}
            </span>
          {/each}
        </div>
      {/if}
      {#if qq.explanation?.trim()}
        <p class="mt-4 px-4 py-3 bg-pub-dark rounded-lg text-pub-muted">
          {qq.explanation}
        </p>
      {/if}
    {/if}
    {/if}

    {#if phase === 'question'}
      <div class="mt-6 pt-6 border-t border-pub-muted">
        <p class="text-sm text-pub-muted mb-2">Answered</p>
        <p>
          {#each answeredList as p, i}
            {#if i > 0}<span class="text-pub-muted">, </span>{/if}
            <span>{p.emoji} {p.name}</span>
          {/each}
          {#if answeredList.length === 0}
            <span class="text-pub-muted">No answers yet</span>
          {/if}
        </p>
      </div>
    {:else if rankedCorrectList.length > 0}
      <div class="mt-6 pt-6 border-t border-pub-muted">
        <p class="text-sm text-pub-muted mb-3">Correct answers</p>
        <ol class="space-y-2">
          {#each rankedCorrectList as entry}
            <li class="flex items-center gap-4">
              <span class="text-pub-gold font-bold w-12">#{entry.rank}</span>
              <span>{entry.emoji}</span>
              <span>{entry.name}</span>
              <span class="ml-auto font-bold text-pub-gold">+{entry.points}</span>
            </li>
          {/each}
        </ol>
      </div>
    {:else}
      <p class="mt-6 text-pub-muted">Waiting for next question...</p>
    {/if}

    {#if currentRoundQuestionTotal > 0}
      <p class="mt-4 text-center text-sm font-medium text-pub-muted">
        {currentQuestionNumber}/{currentRoundQuestionTotal}
      </p>
    {/if}
  {/key}
</div>
