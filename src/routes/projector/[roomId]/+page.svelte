<script lang="ts">
  import { page } from '$app/stores';
  import { createSocket } from '$lib/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import { createWakeManager } from '$lib/utils/wake-manager.js';
  import { getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { sortPlayersByScore } from '$lib/utils/players.js';
  import { useCountdown } from '$lib/timer.js';
  import { onMount, onDestroy } from 'svelte';
  import ProjectorJoinView from '$lib/components/projector/ProjectorJoinView.svelte';
  import SessionLeaderboardView from '$lib/components/shared/SessionLeaderboardView.svelte';
  import ProjectorLobbyView from '$lib/components/projector/ProjectorLobbyView.svelte';
  import ProjectorQuizPhaseView from '$lib/components/projector/ProjectorQuizPhaseView.svelte';

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

  $: if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as Window & { __lgqDebug?: unknown }).__lgqDebug = { socket, state };
  }

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

<div class="min-h-full p-4 sm:p-6 flex flex-col items-center justify-center">
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
    {:else if state?.type === 'Question' && state}
      <ProjectorQuizPhaseView
        phase="question"
        {state}
        currentQuestion={currentQuestion}
        {optionLabelStyle}
        {totalTimerSeconds}
        countdown={countdown}
        {currentRoundQuestionTotal}
        {currentQuestionNumber}
      />
    {:else if state?.type === 'RevealAnswer' && state}
      <ProjectorQuizPhaseView
        phase="reveal"
        {state}
        currentQuestion={currentQuestion}
        {optionLabelStyle}
        {totalTimerSeconds}
        countdown={countdown}
        {currentRoundQuestionTotal}
        {currentQuestionNumber}
      />
    {:else if state?.type === 'Scoreboard' || state?.type === 'End'}
      <SessionLeaderboardView
        title={state.type === 'End' ? 'Quiz ended by host' : 'Leaderboard'}
        isEnd={state.type === 'End'}
        players={sortPlayersByScore(state.players)}
      />
    {:else}
      <p class="text-pub-muted text-center">Connecting...</p>
    {/if}
    {/if}
  </div>
</div>
