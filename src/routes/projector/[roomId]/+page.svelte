<script lang="ts">
  import { page } from '$app/stores';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import { createSocket } from '$lib/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { formatOptionLabel, getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { onMount, onDestroy } from 'svelte';
  import { generate } from 'lean-qr';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let qrCanvas: HTMLCanvasElement | null = null;

  $: joinUrl =
    typeof window !== 'undefined' ? window.location.origin + '/play/' + roomId : '';

  $: if (state?.type === 'Lobby' && joinUrl && qrCanvas) {
    generate(joinUrl).toCanvas(qrCanvas, {
      on: [255, 255, 255, 255],
      off: [26, 26, 46, 255],
    });
  }
  let countdown: ReturnType<typeof useCountdown> | null = null;
  $: totalTimerSeconds = state?.quiz?.meta?.default_timer ?? 30;

  $: timerEndsAt =
    state?.type === 'Question' || state?.type === 'RevealAnswer' ? state.timerEndsAt : undefined;
  $: {
    countdown?.destroy?.();
    countdown = useCountdown(timerEndsAt);
  }
  onDestroy(() => countdown?.destroy?.());
  let socket: ReturnType<typeof createSocket> | null = null;
  $: optionLabelStyle = getOptionLabelStyle(state?.quiz?.meta);

  function getCurrentQuestion() {
    if (!state) return null;
    const round = state.quiz?.rounds?.[state.currentRoundIndex];
    return round?.questions?.[state.currentQuestionIndex] ?? null;
  }

  function getAnsweredInOrder(): Array<{ emoji: string; name: string }> {
    const q = getCurrentQuestion();
    if (!q || !state?.submissions) return [];
    const submitted = state.submissions.filter((s) => s.questionId === q.id);
    const players = state.players ?? [];
    return submitted.map((s) => {
      const p = players.find((x) => x.id === s.playerId);
      return p ? { emoji: p.emoji, name: p.name } : { emoji: '?', name: 'Unknown' };
    });
  }

  function getCorrectAnswersInRankOrder(): Array<{ emoji: string; name: string; rank: number; points: number }> {
    const q = getCurrentQuestion();
    if (!q || !state?.submissions || !state?.wrongAnswers) return [];
    const wrongPlayerIds = new Set(
      state.wrongAnswers.filter((w) => w.questionId === q.id).map((w) => w.playerId)
    );
    const correct = state.submissions
      .filter((s) => s.questionId === q.id && !wrongPlayerIds.has(s.playerId))
      .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
    const maxPts = state.quiz?.meta?.ranked_max_points ?? 100;
    const minPts = state.quiz?.meta?.ranked_min_points ?? 10;
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
          : Math.round(
              maxPts - ((currentRank - 1) * (maxPts - minPts)) / (correct.length - 1)
            );
      const p = players.find((x) => x.id === s.playerId);
      return {
        emoji: p?.emoji ?? '?',
        name: p?.name ?? 'Unknown',
        rank: currentRank,
        points: pts,
      };
    });
  }

  $: answeredList = state?.type === 'Question' ? getAnsweredInOrder() : [];
  $: rankedCorrectList =
    state?.type === 'RevealAnswer' &&
    (state.quiz?.meta?.scoring_mode ?? 'standard') === 'ranked'
      ? getCorrectAnswersInRankOrder()
      : [];

  onMount(() => {
    socket = createSocket();
    socket.emit(
      'player:join',
      { roomId },
      (ack: { state?: SerializedState; error?: string }) => {
        if (ack?.error) {
          window.location.href = '/';
          return;
        }
        if (ack?.state) state = ack.state;
      }
    );
    socket.on('state:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });
    socket.on('room:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });
  });
</script>

<div class="min-h-screen p-4 sm:p-6 flex flex-col items-center justify-center">
  <div class="w-full max-w-4xl">
    {#if state?.quiz?.meta?.name}
      <h1 class="text-4xl font-bold text-pub-gold mb-6 text-center">{state.quiz.meta.name}</h1>
    {/if}
    {#if state?.type === 'Lobby'}
      <div class="text-center">
        <h2 class="text-xl font-bold mb-6">Waiting for host to start</h2>
        <p class="text-pub-muted mb-6">Room: <span class="text-pub-gold font-mono">{roomId}</span></p>
        {#if joinUrl}
          <p class="text-lg text-pub-muted mb-4">Scan to join</p>
          <canvas
            bind:this={qrCanvas}
            class="mx-auto rounded-lg min-w-[256px] min-h-[256px] [image-rendering:pixelated]"
          ></canvas>
          <p class="mt-4 text-sm text-pub-muted break-all">
            {joinUrl}
          </p>
        {/if}
      </div>
    {:else if state?.type === 'Question'}
      <div class="bg-pub-darker rounded-lg p-6" data-question-id={getCurrentQuestion()?.id}>
        {#key `${state?.currentRoundIndex}-${state?.currentQuestionIndex}-${(state?.submissions?.length ?? 0)}`}
        {@const q = getCurrentQuestion()}
        {#if q}
          <div class="flex items-start justify-between gap-6 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            {#if state.timerEndsAt && countdown}
              <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
            {/if}
          </div>
          <p class="text-xl mb-6">{q.text}</p>
          {#if q.image}
            {@const src = getQuestionImageSrc(q.image, state?.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if q.type === 'choice'}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded-lg">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">{opt}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'input'}
            <p class="text-xl text-pub-muted">Fill in the blank</p>
          {/if}
        {/if}
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
        {/key}
      </div>
    {:else if state?.type === 'RevealAnswer'}
      <div class="bg-pub-darker rounded-lg p-6">
        {#if getCurrentQuestion()}
          {@const q = getCurrentQuestion()!}
          <div class="flex items-start justify-between gap-6 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            {#if countdown}
              <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
            {/if}
          </div>
          <p class="text-xl mb-4">{q.text}</p>
          {#if q.image}
            {@const src = getQuestionImageSrc(q.image, state?.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if q.type === 'choice'}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded-lg {q.answer === i ? 'ring-2 ring-green-500' : 'opacity-60'}">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">
                      {opt} {#if q.answer === i}(correct){/if}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'input'}
            <p class="px-4 py-2 bg-pub-dark rounded-lg ring-2 ring-pub-gold text-pub-gold">
              Correct: {q.answer.filter(Boolean).join(' / ')}
            </p>
          {/if}
          {#if q.explanation?.trim()}
            <p class="mt-4 px-4 py-3 bg-pub-dark rounded-lg text-pub-muted">
              {q.explanation}
            </p>
          {/if}
        {/if}
        {#if rankedCorrectList.length > 0}
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
      </div>
    {:else if state?.type === 'Scoreboard' || state?.type === 'End'}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-xl font-bold mb-2">
          {state.type === 'End' ? 'Quiz ended by host' : 'Leaderboard'}
        </h2>
        {#if state.type === 'End'}
          <p class="text-pub-muted mb-6">The host ended this quiz session.</p>
        {/if}
        <ol class="space-y-3">
          {#each (state.players ?? []).sort((a, b) => b.score - a.score) as player, i}
            <li class="flex items-center gap-4">
              <span class="text-pub-gold font-bold w-8">#{i + 1}</span>
              <span>{player.emoji}</span>
              <span>{player.name}</span>
              <span class="ml-auto font-bold">{player.score}</span>
            </li>
          {/each}
        </ol>
      </div>
    {:else}
      <p class="text-pub-muted text-center">Connecting...</p>
    {/if}
  </div>
</div>
