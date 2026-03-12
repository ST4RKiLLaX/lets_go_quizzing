<script lang="ts">
  import { page } from '$app/stores';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import HotspotEmojiMarker from '$lib/components/HotspotEmojiMarker.svelte';
  import { createSocket } from '$lib/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import type { HotspotQuestion } from '$lib/types/quiz.js';
  import { createWakeManager } from '$lib/utils/wake-manager.js';
  import { getQuestionOptions, getOptionCounts } from '$lib/player/question-helpers.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { getShuffledReorderIndices } from '$lib/utils/shuffle.js';
  import { formatOptionLabel, getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { getWordCloudTokens } from '$lib/utils/word-cloud.js';
  import { useCountdown } from '$lib/timer.js';
  import { onMount, onDestroy } from 'svelte';
  import ProjectorJoinView from '$lib/components/projector/ProjectorJoinView.svelte';
  import ProjectorLeaderboardView from '$lib/components/projector/ProjectorLeaderboardView.svelte';
  import ProjectorLobbyView from '$lib/components/projector/ProjectorLobbyView.svelte';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let wakeManager: ReturnType<typeof createWakeManager> | null = null;

  $: joinUrl =
    typeof window !== 'undefined' ? window.location.origin + '/play/' + roomId : '';
  let countdown: ReturnType<typeof useCountdown> | null = null;
  $: totalTimerSeconds = state?.quiz?.meta?.default_timer ?? 30;
  $: currentRoundQuestionTotal =
    state?.quiz?.rounds?.[state.currentRoundIndex]?.questions?.length ?? 0;
  $: currentQuestionNumber = (state?.currentQuestionIndex ?? 0) + 1;
  $: currentQuestion =
    state?.quiz?.rounds?.[state.currentRoundIndex]?.questions?.[state.currentQuestionIndex] ?? null;
  $: clockOffsetMs = state?.serverNow != null ? state.serverNow - Date.now() : 0;

  $: timerEndsAt =
    state?.type === 'Question' || state?.type === 'RevealAnswer' ? state.timerEndsAt : undefined;
  $: isActiveQuizPhase = state?.type === 'Question' || state?.type === 'RevealAnswer';
  $: {
    countdown?.destroy?.();
    countdown = useCountdown(timerEndsAt, clockOffsetMs);
  }
  $: if (wakeManager) {
    void wakeManager.setAutoActive(!!isActiveQuizPhase);
  }
  onDestroy(() => {
    countdown?.destroy?.();
    void wakeManager?.destroy();
  });
  let socket: ReturnType<typeof createSocket> | null = null;
  let joinError = '';
  let needsRoomPassword = false;
  let joinPassword = '';
  let joiningRoom = false;
  $: optionLabelStyle = getOptionLabelStyle(state?.quiz?.meta);

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

  function getCorrectAnswersInRankOrder(): Array<{ emoji: string; name: string; rank: number; points: number }> {
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

  $: if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as Window & { __lgqDebug?: unknown }).__lgqDebug = { socket, state };
  }
  $: answeredList = state?.type === 'Question' ? getAnsweredInOrder() : [];
  $: rankedCorrectList =
    state?.type === 'RevealAnswer' &&
    (state.quiz?.meta?.scoring_mode ?? 'standard') === 'ranked'
      ? getCorrectAnswersInRankOrder()
      : [];

  const PROJECTOR_PASSWORD_KEY = 'lgq_projector_password_';

  function joinRoom(password: string) {
    if (!socket) return;
    joiningRoom = true;
    const pwd = password.trim() || undefined;
    socket.emit(
      'projector:join',
      { roomId, password: pwd },
      (ack: { state?: SerializedState; error?: string }) => {
        joiningRoom = false;
        if (ack?.error) {
          if (ack.error === 'Room password required') {
            needsRoomPassword = true;
            joinError = '';
            return;
          }
          if (ack.error === 'Invalid room password') {
            needsRoomPassword = true;
            joinError = ack.error;
            try {
              sessionStorage.removeItem(PROJECTOR_PASSWORD_KEY + roomId);
            } catch {
              /* ignore */
            }
            return;
          }
          window.location.href = '/';
          return;
        }
        needsRoomPassword = false;
        joinError = '';
        if (ack?.state) state = ack.state;
        if (pwd) {
          try {
            sessionStorage.setItem(PROJECTOR_PASSWORD_KEY + roomId, pwd);
          } catch {
            /* ignore */
          }
        }
      }
    );
  }

  onMount(() => {
    wakeManager = createWakeManager();

    socket = createSocket();
    let initialPassword = '';
    try {
      initialPassword = sessionStorage.getItem(PROJECTOR_PASSWORD_KEY + roomId) ?? '';
    } catch {
      /* ignore */
    }
    if (initialPassword) {
      joinPassword = initialPassword;
    }
    joinRoom(initialPassword);
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
    {#if !state}
      <ProjectorJoinView
        roomId={roomId ?? ''}
        needsRoomPassword={needsRoomPassword}
        joinError={joinError}
        bind:joinPassword
        joiningRoom={joiningRoom}
        onJoin={joinRoom}
      />
    {:else}
      {#if state?.quiz?.meta?.name}
        <h1 class="text-4xl font-bold text-pub-gold mb-6 text-center">{state.quiz.meta.name}</h1>
      {/if}
      {#if state?.type === 'Lobby'}
      <ProjectorLobbyView roomId={roomId ?? ''} joinUrl={joinUrl} />
    {:else if state?.type === 'QuestionPreview'}
      <div class="bg-pub-darker rounded-lg p-6 text-center">
        <h2 class="text-3xl font-bold text-pub-gold mb-2">Incoming</h2>
        <p class="text-xl text-pub-muted">Next question</p>
        {#if currentRoundQuestionTotal > 0}
          <p class="mt-4 text-sm font-medium text-pub-muted">
            Question {currentQuestionNumber} of {currentRoundQuestionTotal}
          </p>
        {/if}
      </div>
    {:else if state?.type === 'Question'}
      <div class="bg-pub-darker rounded-lg p-6" data-question-id={currentQuestion?.id}>
        {#key `${state?.currentRoundIndex}-${state?.currentQuestionIndex}-${(state?.submissions?.length ?? 0)}`}
        {#if currentQuestion}
        {@const q = currentQuestion}
          <div class="flex items-start justify-between gap-6 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            {#if state.timerEndsAt && countdown}
              <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
            {/if}
          </div>
          <p class="text-xl mb-6">{q.text}</p>
          {#if q.type === 'hotspot'}
            {@const hq = q as HotspotQuestion}
            {@const src = getQuestionImageSrc(hq.image, state?.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
              <p class="text-xl text-pub-muted text-center mt-4">Tap the correct area</p>
            {/if}
          {:else if q.image}
            {@const src = getQuestionImageSrc(q.image, state?.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if q.type === 'choice' || q.type === 'true_false' || q.type === 'poll'}
            {@const options = getQuestionOptions(q)}
            <ul class="space-y-2">
              {#each options as opt, i}
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
          {:else if q.type === 'multi_select'}
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
          {:else if q.type === 'reorder'}
            <ul class="space-y-2">
              {#each getShuffledReorderIndices(q.id, q.options.length) as optIndex, i}
                <li class="px-4 py-2 bg-pub-dark rounded-lg opacity-80">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-muted text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">{q.options[optIndex]}</span>
                  </div>
                </li>
              {/each}
            </ul>
            <p class="mt-4 text-xl text-pub-muted text-center">Arrange these in the correct order</p>
          {:else if q.type === 'slider'}
            <p class="text-xl text-pub-muted">Choose a value on the slider</p>
          {:else if q.type === 'input'}
            <p class="text-xl text-pub-muted">Fill in the blank</p>
          {:else if q.type === 'open_ended'}
            <p class="text-xl text-pub-muted">Type your response</p>
          {:else if q.type === 'word_cloud'}
            <p class="text-xl text-pub-muted">Type a short word or phrase</p>
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
        {#if currentRoundQuestionTotal > 0}
          <p class="mt-4 text-center text-sm font-medium text-pub-muted">
            {currentQuestionNumber}/{currentRoundQuestionTotal}
          </p>
        {/if}
        {/key}
      </div>
    {:else if state?.type === 'RevealAnswer'}
      <div class="bg-pub-darker rounded-lg p-6">
        {#if currentQuestion}
          {@const q = currentQuestion}
          <div class="flex items-start justify-between gap-6 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            {#if countdown}
              <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
            {/if}
          </div>
          <p class="text-xl mb-4">{q.text}</p>
          {#if q.type === 'hotspot'}
            {@const hq = q as HotspotQuestion}
            {@const src = getQuestionImageSrc(hq.image, state?.quizFilename)}
            {@const ar = hq.imageAspectRatio ?? 1}
            {@const rY = hq.answer.radiusY ?? hq.answer.radius}
            {@const rot = hq.answer.rotation ?? 0}
            {@const hotspotSubs = (state?.submissions ?? []).filter((s) => s.questionId === q.id && s.answerX != null && s.answerY != null)}
            {#if src}
              <div class="relative inline-block max-w-full my-4">
                <img src={src} alt="" class="max-w-full rounded-lg block" />
                <div
                  class="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none rounded-full origin-center"
                  style="left: {((hq.answer.x - hq.answer.radius / ar) * 100)}%; top: {((hq.answer.y - rY) * 100)}%; width: {(hq.answer.radius * 2 / ar) * 100}%; height: {(rY * 2) * 100}%; transform: rotate({rot}deg);"
                ></div>
                {#each hotspotSubs as sub}
                  {@const player = (state?.players ?? []).find((p) => p.id === sub.playerId)}
                  {@const isWrong = state?.wrongAnswers?.some((w) => w.playerId === sub.playerId && w.questionId === q.id)}
                  <HotspotEmojiMarker
                    x={sub.answerX!}
                    y={sub.answerY!}
                    emoji={player?.emoji ?? '?'}
                    name={player?.name ?? 'Unknown'}
                    isWrong={isWrong}
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
          {#if q.type === 'choice' || q.type === 'true_false'}
            {@const options = getQuestionOptions(q)}
            <ul class="space-y-2">
              {#each options as opt, i}
                {@const correctIndex = q.type === 'choice' ? q.answer : (q.answer ? 0 : 1)}
                <li class="px-4 py-2 bg-pub-dark rounded-lg {correctIndex === i ? 'ring-2 ring-green-500' : 'opacity-60'}">
                  <div class="flex items-center gap-2">
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
            {@const counts = getOptionCounts(state?.submissions ?? [], q.id)}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded-lg {q.answer.includes(i) ? 'ring-2 ring-green-500' : 'opacity-60'}">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">
                      {opt} {#if q.answer.includes(i)}(correct){/if}
                    </span>
                    <span class="text-pub-gold font-semibold">{counts.get(i) ?? 0}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'reorder'}
            <div class="space-y-2">
              <h3 class="text-sm font-semibold text-pub-muted mb-2 text-center">Correct Order</h3>
              <ul class="space-y-2">
                {#each q.answer as optIndex, i}
                  <li class="px-4 py-2 bg-pub-dark rounded-lg ring-2 ring-green-500">
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
          {:else if q.type === 'poll'}
            {@const counts = getOptionCounts(state?.submissions ?? [], q.id)}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded-lg">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">{opt}</span>
                    <span class="text-pub-gold font-semibold">{counts.get(i) ?? 0}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'slider'}
            <div class="space-y-3">
              <div class="px-4 py-4 bg-pub-dark rounded-lg">
                <input
                  type="range"
                  min={q.min}
                  max={q.max}
                  step={q.step}
                  value={q.answer}
                  disabled
                  class="w-full accent-pub-gold"
                />
                <p class="mt-2 text-center text-pub-gold font-semibold">{q.answer}</p>
              </div>
            </div>
          {:else if q.type === 'input'}
            <p class="px-4 py-2 bg-pub-dark rounded-lg ring-2 ring-pub-gold text-pub-gold">
              Correct: {q.answer.filter(Boolean).join(' / ')}
            </p>
          {:else if q.type === 'open_ended'}
            {@const visibleSubs = (state.submissions ?? []).filter(s => s.questionId === q.id && s.visibility !== 'blocked' && !s.projectorHiddenByHost)}
            <div class="space-y-3 mt-4">
              <h3 class="text-lg font-semibold text-pub-muted">Responses:</h3>
              <ul class="space-y-2">
                {#each visibleSubs as sub}
                  {@const player = state.players?.find(p => p.id === sub.playerId)}
                  <li class="px-4 py-3 bg-pub-dark rounded-lg text-lg">
                    <span class="text-pub-muted mr-3">{player?.emoji} {player?.name}:</span>
                    {sub.answerText}
                  </li>
                {/each}
              </ul>
            </div>
          {:else if q.type === 'word_cloud'}
            {@const hiddenWords = new Set((state.hiddenWordsByQuestion ?? {})[q.id] ?? [])}
            {@const wordCounts = (state.submissions ?? [])
              .filter(s => s.questionId === q.id && s.visibility !== 'blocked')
              .reduce((acc, s) => {
                for (const token of getWordCloudTokens(s.answerText ?? '')) {
                  if (!hiddenWords.has(token)) acc.set(token, (acc.get(token) || 0) + 1);
                }
                return acc;
              }, new Map<string, number>())}
            <div class="mt-4 flex flex-wrap gap-4 justify-center items-center p-8 bg-pub-dark rounded-lg min-h-[200px]">
              {#each Array.from(wordCounts).sort((a, b) => b[1] - a[1]) as [word, count]}
                <span style="font-size: {Math.max(1.5, Math.min(5, 1 + count * 0.5))}rem; opacity: {Math.min(1, 0.4 + count * 0.2)}" class="text-pub-gold font-bold leading-none inline-block">
                  {word}
                </span>
              {/each}
            </div>
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
        {#if currentRoundQuestionTotal > 0}
          <p class="mt-4 text-center text-sm font-medium text-pub-muted">
            {currentQuestionNumber}/{currentRoundQuestionTotal}
          </p>
        {/if}
      </div>
    {:else if state?.type === 'Scoreboard' || state?.type === 'End'}
      <ProjectorLeaderboardView
        title={state.type === 'End' ? 'Quiz ended by host' : 'Leaderboard'}
        isEnd={state.type === 'End'}
        players={(state.players ?? []).sort((a, b) => b.score - a.score)}
      />
    {:else}
      <p class="text-pub-muted text-center">Connecting...</p>
    {/if}
    {/if}
  </div>
</div>
