<script lang="ts">
  import { page } from '$app/stores';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import { createSocket, getOrCreatePlayerId } from '$lib/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { formatOptionLabel, getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { onMount, onDestroy } from 'svelte';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let countdown: ReturnType<typeof useCountdown> | null = null;

  $: timerEndsAt =
    state?.type === 'Question' || state?.type === 'RevealAnswer' ? state.timerEndsAt : undefined;
  $: {
    countdown?.destroy?.();
    countdown = useCountdown(timerEndsAt);
  }
  onDestroy(() => countdown?.destroy?.());
  let socket: ReturnType<typeof createSocket> | null = null;
  let name = '';
  let emoji = '👤';
  let registered = false;
  let inputAnswer = '';

  const EMOJI_OPTIONS = [
    '👤', '😀', '😎', '🤓', '😇', '🥳', '🤩', '😊', '🙂', '😏',
    '🎉', '🧠', '⭐', '🔥', '🚀', '🎯', '💡', '🏆', '🎮', '🎸',
    '🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🦉', '🐙',
    '🍕', '🍔', '☕', '🍩', '🌮', '🥑', '🍎', '🍋', '🌶️', '🍿',
  ];

  onMount(() => {
    const playerId = getOrCreatePlayerId();
    socket = createSocket();
    socket.emit(
      'player:join',
      { roomId, playerId },
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

  function register() {
    const playerId = getOrCreatePlayerId();
    socket?.emit(
      'player:register',
      { playerId, name: name.trim() || 'Anonymous', emoji },
      (ack: { ok?: boolean; error?: string }) => {
        if (ack?.ok) registered = true;
      }
    );
  }

  let submitError = '';
  let selectedAnswer: { questionId: string; answerIndex: number } | null = null;
  let selectedInput: string | null = null;

  $: currentQuestionKey =
    state?.type === 'Question'
      ? `${state.currentRoundIndex}-${state.currentQuestionIndex}`
      : '';
  let prevQuestionKey = '';
  $: {
    const key = currentQuestionKey;
    if (key && key !== prevQuestionKey) {
      prevQuestionKey = key;
      selectedAnswer = null;
      selectedInput = null;
    }
  }

  $: currentQuestionId = getCurrentQuestion()?.id ?? '';
  $: questionTimeExpired = !!(
    state?.type === 'Question' &&
    state?.timerEndsAt &&
    countdown &&
    ($countdown ?? 0) === 0
  );
  $: hasAnsweredCurrentQuestion =
    hasSubmitted(currentQuestionId) ||
    selectedAnswer?.questionId === currentQuestionId ||
    selectedInput === currentQuestionId;
  $: showTimesUpMessage = !!(questionTimeExpired && !hasAnsweredCurrentQuestion);

  function submitChoice(questionId: string, answerIndex: number) {
    if (hasSubmitted(questionId) || selectedAnswer?.questionId === questionId || questionTimeExpired) return;
    submitError = '';
    selectedAnswer = { questionId, answerIndex };
    const playerId = getOrCreatePlayerId();
    state = state
      ? { ...state, submissions: [...(state.submissions ?? []), { playerId, questionId, answerIndex }] }
      : state;
    socket?.emit('player:answer', { questionId, answerIndex }, (ack: { error?: string }) => {
      if (ack?.error) {
        submitError = ack.error;
        selectedAnswer = null;
        state =
          state?.submissions != null
            ? { ...state, submissions: state.submissions.filter((s) => !(s.playerId === playerId && s.questionId === questionId)) }
            : state;
      }
    });
  }

  function submitInput(questionId: string, answerText: string) {
    if (hasSubmitted(questionId) || selectedInput === questionId || questionTimeExpired) return;
    submitError = '';
    selectedInput = questionId;
    const playerId = getOrCreatePlayerId();
    state = state
      ? { ...state, submissions: [...(state.submissions ?? []), { playerId, questionId }] }
      : state;
    socket?.emit('player:answer', { questionId, answerText }, (ack: { error?: string }) => {
      if (ack?.error) {
        submitError = ack.error;
        selectedInput = null;
        state =
          state?.submissions != null
            ? { ...state, submissions: state.submissions.filter((s) => !(s.playerId === playerId && s.questionId === questionId)) }
            : state;
      }
    });
  }

  function hasSubmitted(questionId: string): boolean {
    const playerId = getOrCreatePlayerId();
    return state?.submissions?.some(
      (s) => s.playerId === playerId && s.questionId === questionId
    ) ?? false;
  }

  function getSubmittedAnswerIndex(questionId: string): number | undefined {
    const playerId = getOrCreatePlayerId();
    const sub = state?.submissions?.find(
      (s) => s.playerId === playerId && s.questionId === questionId
    );
    return sub?.answerIndex;
  }

  function getCurrentQuestion() {
    if (!state) return null;
    const round = state.quiz?.rounds?.[state.currentRoundIndex];
    return round?.questions?.[state.currentQuestionIndex] ?? null;
  }

  $: playerId = getOrCreatePlayerId();
  $: currentPlayer = state?.players?.find((p) => p.id === playerId);
  $: myScore = currentPlayer?.score ?? 0;
  $: playerDisplayName = (currentPlayer?.name ?? name.trim()) || 'Anonymous';
  $: playerDisplayEmoji = currentPlayer?.emoji ?? emoji;
  $: optionLabelStyle = getOptionLabelStyle(state?.quiz?.meta);
  $: totalTimerSeconds = state?.quiz?.meta?.default_timer ?? 30;
</script>

<div class="min-h-screen p-6">
  <div class="max-w-2xl mx-auto">
    {#if registered && state}
      <div class="flex justify-between items-center gap-3 mb-4">
        <span class="text-pub-gold font-bold truncate">
          {state.quiz?.meta?.name ?? 'Quiz'}
        </span>
        <span class="text-pub-gold font-bold truncate">{playerDisplayEmoji} {playerDisplayName}: {myScore}</span>
      </div>
    {/if}
    {#if state?.type === 'Lobby' && !registered}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">Join the quiz</h2>
        <form class="space-y-4" on:submit|preventDefault={register}>
          <div>
            <label for="player-name" class="block text-sm text-pub-muted mb-1">Your name</label>
            <input
              id="player-name"
              type="text"
              bind:value={name}
              placeholder="Enter your name"
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <span class="block text-sm text-pub-muted mb-2">Pick an emoji</span>
            <div
              class="flex gap-2 overflow-x-auto flex-nowrap pb-2 -mx-1"
              role="group"
              aria-label="Pick an emoji"
              style="scrollbar-width: thin;"
            >
              {#each EMOJI_OPTIONS as e}
                <button
                  type="button"
                  class="text-2xl p-2 rounded flex-shrink-0 {emoji === e ? 'bg-pub-accent ring-2 ring-pub-gold' : 'bg-pub-dark hover:bg-pub-darker'}"
                  on:click={() => (emoji = e)}
                >
                  {e}
                </button>
              {/each}
            </div>
          </div>
          <button
            type="submit"
            class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90"
          >
            Join
          </button>
        </form>
      </div>
    {:else if state?.type === 'Lobby'}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">Waiting for host to start</h2>
        <p class="text-pub-muted">Room: <span class="text-pub-gold font-mono">{roomId}</span></p>
        <p class="text-pub-muted mt-2">Players: {(state?.players ?? []).length}</p>
      </div>
    {:else if state?.type === 'Question'}
      <div class="bg-pub-darker rounded-lg p-6">
        {#if getCurrentQuestion()}
          {@const q = getCurrentQuestion()!}
          <div class="flex items-start justify-between gap-4 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            {#if countdown}
              <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
            {/if}
          </div>
          <p class="text-xl mb-6">{q.text}</p>
          {#if q.image}
            {@const src = getQuestionImageSrc(q.image, state.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if q.type === 'choice'}
            <div class="space-y-2">
              {#each q.options as opt, i}
                {@const isChosen = (hasSubmitted(q.id) && getSubmittedAnswerIndex(q.id) === i) || (selectedAnswer?.questionId === q.id && selectedAnswer?.answerIndex === i)}
                <button
                  class="w-full px-4 py-3 bg-pub-dark rounded-lg text-left hover:bg-pub-accent/20 disabled:opacity-50 flex items-center gap-2 {isChosen ? 'ring-2 ring-pub-gold' : ''} {questionTimeExpired ? 'opacity-60' : ''}"
                  disabled={hasSubmitted(q.id) || selectedAnswer?.questionId === q.id || questionTimeExpired}
                  on:click={() => submitChoice(q.id, i)}
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
          {:else if q.type === 'input'}
            <form
              class="flex gap-2"
              on:submit|preventDefault={() => {
                if (inputAnswer.trim() && !hasSubmitted(q.id) && !questionTimeExpired) {
                  submitInput(q.id, inputAnswer.trim());
                  inputAnswer = '';
                }
              }}
            >
              <input
                type="text"
                bind:value={inputAnswer}
                placeholder="Your answer"
                class="flex-1 bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
                on:keydown={(e) => {
                  if (e.key === 'Enter') {
                    if (inputAnswer.trim() && !questionTimeExpired) {
                      submitInput(q.id, inputAnswer.trim());
                      inputAnswer = '';
                    }
                  }
                }}
              />
              <button
                type="submit"
                class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                disabled={hasSubmitted(q.id) || !inputAnswer.trim() || questionTimeExpired}
              >
                Submit
              </button>
            </form>
          {/if}
        {/if}
        {#if hasAnsweredCurrentQuestion}
          <p class="mt-4 text-pub-gold">Answer submitted!</p>
        {:else if showTimesUpMessage}
          <p class="mt-4 text-red-400">Time's Up!</p>
        {:else if submitError}
          <p class="mt-4 text-red-500">{submitError}</p>
        {/if}
      </div>
    {:else if state?.type === 'RevealAnswer'}
      <div class="bg-pub-darker rounded-lg p-6">
        {#if getCurrentQuestion()}
          {@const q = getCurrentQuestion()!}
          <div class="flex items-start justify-between gap-4 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            {#if countdown}
              <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
            {/if}
          </div>
          <p class="text-xl mb-4">{q.text}</p>
          {#if q.image}
            {@const src = getQuestionImageSrc(q.image, state.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if q.type === 'choice'}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                {@const isChosen = (hasSubmitted(q.id) && getSubmittedAnswerIndex(q.id) === i) || (selectedAnswer?.questionId === q.id && selectedAnswer?.answerIndex === i)}
                <li class="px-4 py-2 bg-pub-dark rounded {q.answer === i ? 'ring-2 ring-green-500' : `opacity-60 ${isChosen ? 'ring-2 ring-pub-gold' : ''}`}">
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
                      {opt} {#if q.answer === i}(correct){/if}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'input'}
            <p class="px-4 py-2 bg-pub-dark rounded ring-2 ring-pub-gold text-pub-gold">
              Correct: {q.answer.filter(Boolean).join(' / ')}
            </p>
          {/if}
          {#if q.explanation?.trim()}
            <p class="mt-4 px-4 py-3 bg-pub-dark rounded text-pub-muted">
              {q.explanation}
            </p>
          {/if}
        {/if}
        <p class="mt-6 text-pub-muted">Waiting for next question...</p>
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
      <p class="text-pub-muted">Connecting...</p>
    {/if}
  </div>
</div>
