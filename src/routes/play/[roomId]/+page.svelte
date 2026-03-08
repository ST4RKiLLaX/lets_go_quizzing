<script lang="ts">
  import { page } from '$app/stores';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import PlayerConfetti from '$lib/components/PlayerConfetti.svelte';
  import { createSocket, getOrCreatePlayerId } from '$lib/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import { createWakeManager, type WakeSnapshot } from '$lib/utils/wake-manager.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { formatOptionLabel, getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { onMount, onDestroy } from 'svelte';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let countdown: ReturnType<typeof useCountdown> | null = null;
  let wakeManager: ReturnType<typeof createWakeManager> | null = null;
  let wakeSnapshot: WakeSnapshot = {
    desired: false,
    active: false,
    status: 'off',
    method: 'none',
    errorMessage: null,
  };
  let stopWakeSubscription: (() => void) | null = null;
  let keepAwakeEnabled = false;
  let clockOffsetMs = 0;
  const confettiDurationMs = 1200;
  let showConfetti = false;
  let confettiRunId = 0;
  let previousStateType: SerializedState['type'] | null = null;
  const celebratedRevealKeys = new Set<string>();

  $: timerEndsAt =
    state?.type === 'Question' || state?.type === 'RevealAnswer' ? state.timerEndsAt : undefined;
  $: isActiveQuizPhase = state?.type === 'Question' || state?.type === 'RevealAnswer';
  $: clockOffsetMs = state?.serverNow != null ? state.serverNow - Date.now() : 0;
  $: {
    countdown?.destroy?.();
    countdown = useCountdown(timerEndsAt, clockOffsetMs);
  }
  $: if (wakeManager) {
    void wakeManager.setAutoActive(false);
    void wakeManager.setUserEnabled(!!(keepAwakeEnabled && isActiveQuizPhase));
  }
  onDestroy(() => {
    countdown?.destroy?.();
    stopWakeSubscription?.();
    void wakeManager?.destroy();
  });
  let socket: ReturnType<typeof createSocket> | null = null;
  let name = '';
  let emoji = '👤';
  let registerError = '';
  let registered = false;
  let inputAnswer = '';
  let joinError = '';
  let joinPassword = '';
  let joiningRoom = false;
  let needsRoomPassword = false;

  const EMOJI_OPTIONS = [
    '👤', '😀', '😎', '🤓', '😇', '🥳', '🤩', '😊', '🙂', '😏',
    '🎉', '🧠', '⭐', '🔥', '🚀', '🎯', '💡', '🏆', '🎮', '🎸',
    '🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🦉', '🐙',
    '🍕', '🍔', '☕', '🍩', '🌮', '🥑', '🍎', '🍋', '🌶️', '🍿',
    '😄', '😁', '😆', '😂', '🤣', '😍', '🥰', '😘', '😋', '🙌',
    '👏', '🤝', '💪', '🫶', '🎊', '🎈', '🎵', '🎤', '🎨', '📚',
    '🧩', '♟️', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏓',
    '🐵', '🐨', '🐮', '🐷', '🐰', '🐹', '🦄', '🐢', '🐬', '🐝',
    '🍉', '🍇', '🍓', '🍒', '🍍', '🥨', '🍪', '🍫', '🧋', '🧁',
  ];
  const keepAwakeStorageKey = 'lgq_keep_awake_enabled';

  onMount(() => {
    wakeManager = createWakeManager();
    stopWakeSubscription = wakeManager.subscribe((next) => {
      wakeSnapshot = next;
    });
    try {
      keepAwakeEnabled = localStorage.getItem(keepAwakeStorageKey) === '1';
    } catch {
      keepAwakeEnabled = false;
    }

    const playerId = getOrCreatePlayerId();
    socket = createSocket();
    joinRoom(playerId, joinPassword);
    socket.on('state:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });
    socket.on('room:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });
  });

  function register() {
    registerError = '';
    if (unavailableEmojis.has(emoji)) {
      registerError = 'That emoji is no longer available. Please choose another.';
      return;
    }
    const playerId = getOrCreatePlayerId();
    socket?.emit(
      'player:register',
      { playerId, name: name.trim() || 'Anonymous', emoji },
      (ack: { ok?: boolean; error?: string }) => {
        if (ack?.error) {
          registerError =
            ack.error === 'Emoji unavailable'
              ? 'That emoji was just taken. Please pick another.'
              : ack.error;
          return;
        }
        if (ack?.ok) registered = true;
      }
    );
  }

  function joinRoom(playerId: string, password: string) {
    if (!socket) return;
    joiningRoom = true;
    socket.emit(
      'player:join',
      { roomId, playerId, password: password.trim() || undefined },
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
            return;
          }
          window.location.href = '/';
          return;
        }
        needsRoomPassword = false;
        joinError = '';
        if (ack?.state) state = ack.state;
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
  $: unavailableEmojis = new Set(
    (state?.players ?? []).filter((p) => p.isActive).map((p) => p.emoji)
  );
  $: {
    if (!registered && unavailableEmojis.has(emoji)) {
      const firstAvailable = EMOJI_OPTIONS.find((e) => !unavailableEmojis.has(e));
      if (firstAvailable) emoji = firstAvailable;
    }
  }
  $: if (currentPlayer && !registered) registered = true;
  $: myScore = currentPlayer?.score ?? 0;
  $: playerDisplayName = (currentPlayer?.name ?? name.trim()) || 'Anonymous';
  $: playerDisplayEmoji = currentPlayer?.emoji ?? emoji;
  $: optionLabelStyle = getOptionLabelStyle(state?.quiz?.meta);
  $: totalTimerSeconds = state?.quiz?.meta?.default_timer ?? 30;
  $: currentRoundQuestionTotal =
    state?.quiz?.rounds?.[state.currentRoundIndex]?.questions?.length ?? 0;
  $: currentQuestionNumber = (state?.currentQuestionIndex ?? 0) + 1;
  $: revealQuestion = state?.type === 'RevealAnswer' ? getCurrentQuestion() : null;
  $: revealKey =
    state?.type === 'RevealAnswer' && revealQuestion
      ? `${state.currentRoundIndex}-${state.currentQuestionIndex}-${revealQuestion.id}`
      : '';
  $: {
    const currentType = state?.type ?? null;
    const enteredReveal = currentType === 'RevealAnswer' && previousStateType !== 'RevealAnswer';
    if (
      enteredReveal &&
      revealKey &&
      !celebratedRevealKeys.has(revealKey) &&
      isCurrentPlayerCorrectOnReveal(revealQuestion?.id ?? '')
    ) {
      celebratedRevealKeys.add(revealKey);
      triggerConfetti();
    }
    previousStateType = currentType;
  }

  function isCurrentPlayerCorrectOnReveal(questionId: string): boolean {
    if (!questionId || state?.type !== 'RevealAnswer') return false;
    const me = getOrCreatePlayerId();
    const submitted =
      state.submissions?.some((s) => s.playerId === me && s.questionId === questionId) ?? false;
    if (!submitted) return false;
    const markedWrong =
      state.wrongAnswers?.some((w) => w.playerId === me && w.questionId === questionId) ?? false;
    return !markedWrong;
  }

  function triggerConfetti() {
    showConfetti = true;
    confettiRunId += 1;
  }

  function onConfettiDone() {
    showConfetti = false;
  }

  function toggleKeepAwake() {
    keepAwakeEnabled = !keepAwakeEnabled;
    try {
      localStorage.setItem(keepAwakeStorageKey, keepAwakeEnabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function getWakeStatusLabel(status: WakeSnapshot['status']) {
    switch (status) {
      case 'on':
        return 'On';
      case 'unsupported':
        return 'Unsupported';
      case 'blocked':
        return 'Tap to keep awake';
      case 'error':
        return 'Unavailable';
      default:
        return 'Off';
    }
  }
</script>

<div class="min-h-screen p-6">
  {#key confettiRunId}
    {#if showConfetti}
      <PlayerConfetti durationMs={confettiDurationMs} on:done={onConfettiDone} />
    {/if}
  {/key}
  <div class="max-w-2xl mx-auto">
    {#if registered && state}
      <div class="flex justify-between items-center gap-3 mb-4">
        <span class="text-pub-gold font-bold truncate">
          {state.quiz?.meta?.name ?? 'Quiz'}
        </span>
        <span class="text-pub-gold font-bold truncate">{playerDisplayEmoji} {playerDisplayName}: {myScore}</span>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-4 text-xs">
        <button
          type="button"
          class="px-3 py-1 rounded-md border border-pub-muted bg-pub-dark hover:opacity-90 w-full sm:w-auto"
          on:click={toggleKeepAwake}
        >
          Keep screen awake: {keepAwakeEnabled ? 'On' : 'Off'}
        </button>
        <div class="flex items-center justify-between sm:justify-end gap-2 text-pub-muted">
          <span>Screen awake: {getWakeStatusLabel(wakeSnapshot.status)}</span>
          {#if wakeSnapshot.status === 'blocked'}
            <button
              type="button"
              class="px-2 py-1 rounded-md border border-pub-muted bg-pub-dark hover:opacity-90"
              on:click={() => wakeManager?.sync()}
            >
              Try again
            </button>
          {/if}
        </div>
      </div>
    {/if}
    {#if !state}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">Join room {roomId}</h2>
        {#if needsRoomPassword}
          <form
            class="space-y-3"
            on:submit|preventDefault={() => joinRoom(getOrCreatePlayerId(), joinPassword)}
          >
            <label for="join-password" class="block text-sm text-pub-muted">
              This room requires a password
            </label>
            <input
              id="join-password"
              type="password"
              bind:value={joinPassword}
              placeholder="Enter room password"
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
            {#if joinError === 'Invalid room password'}
              <p class="text-sm text-red-400">Invalid room password. Please try again.</p>
            {/if}
            <button
              type="submit"
              class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              disabled={joiningRoom || !joinPassword.trim()}
            >
              {joiningRoom ? 'Joining...' : 'Join Room'}
            </button>
          </form>
        {:else}
          <p class="text-pub-muted">Joining room...</p>
        {/if}
      </div>
    {:else if state?.type === 'Lobby' && !registered}
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
              class="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-44 overflow-y-auto overflow-x-hidden p-1"
              role="group"
              aria-label="Pick an emoji"
              style="scrollbar-width: thin;"
            >
              {#each EMOJI_OPTIONS as e}
                {@const isUnavailable = unavailableEmojis.has(e)}
                <button
                  type="button"
                  class="relative h-12 w-full text-2xl leading-none rounded flex items-center justify-center {isUnavailable ? 'bg-pub-dark opacity-45 cursor-not-allowed' : emoji === e ? 'bg-pub-accent ring-2 ring-pub-gold' : 'bg-pub-dark hover:bg-pub-darker'}"
                  disabled={isUnavailable}
                  on:click={() => {
                    if (!isUnavailable) emoji = e;
                  }}
                >
                  {e}
                  {#if isUnavailable}
                    <span class="absolute inset-0 flex items-center justify-center text-base font-extrabold text-red-300 pointer-events-none">
                      ✕
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
            {#if registerError}
              <p class="mt-2 text-sm text-red-400">{registerError}</p>
            {/if}
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
          {#if currentRoundQuestionTotal > 0}
            <p class="mt-4 text-center text-sm font-medium text-pub-muted">
              {currentQuestionNumber}/{currentRoundQuestionTotal}
            </p>
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
          {#if currentRoundQuestionTotal > 0}
            <p class="mt-4 text-center text-sm font-medium text-pub-muted">
              {currentQuestionNumber}/{currentRoundQuestionTotal}
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
