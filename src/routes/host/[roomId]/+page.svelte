<script lang="ts">
  import { page } from '$app/stores';
  import { socketStore } from '$lib/stores/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { formatOptionLabel, getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { onMount, onDestroy } from 'svelte';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let joinError = '';
  let hostRejoinPassword = '';
  let countdown: ReturnType<typeof useCountdown> | null = null;
  $: optionLabelStyle = getOptionLabelStyle(state?.quiz?.meta);

  $: timerEndsAt = state?.type === 'Question' ? state.timerEndsAt : undefined;
  $: {
    countdown?.destroy?.();
    countdown = useCountdown(timerEndsAt);
  }
  onDestroy(() => countdown?.destroy?.());
  let socket: import('socket.io-client').Socket | null = null;

  function doHostJoin(password?: string) {
    joinError = '';
    socket?.emit('host:join', { roomId, password }, (ack: { state?: SerializedState; error?: string }) => {
      if (ack?.state) {
        state = ack.state;
        hostRejoinPassword = '';
      }
      if (ack?.error) {
        joinError = ack.error;
        state = null;
      }
    });
  }

  onMount(() => {
    // Always reconnect on host page so the handshake includes latest auth cookies.
    socket = socketStore.connect();
    let pwd: string | undefined;
    try {
      pwd = sessionStorage.getItem('lgq_host_password') ?? undefined;
      // Don't remove - keep for creating new rooms after game ends
    } catch {
      /* ignore */
    }
    doHostJoin(pwd);
    const onStateUpdate = (payload: { state: SerializedState }) => {
      state = payload.state;
    };
    const onRoomUpdate = (payload: { state: SerializedState }) => {
      const incoming = payload?.state;
      if (!incoming) return;
      const incomingQ = incoming.currentQuestionIndex ?? -1;
      const currentQ = state?.currentQuestionIndex ?? -1;
      if (incomingQ >= currentQ) state = incoming;
    };
    socket.on('state:update', onStateUpdate);
    socket.on('room:update', onRoomUpdate);
    return () => {
      socket?.off('state:update', onStateUpdate);
      socket?.off('room:update', onRoomUpdate);
    };
  });

  function next() {
    socket?.emit('host:next', {}, () => {});
  }

  function stopTimer() {
    socket?.emit('host:stop_timer', {}, () => {});
  }

  function showLeaderboard() {
    socket?.emit('host:show_leaderboard', {}, () => {});
  }

  function override(playerId: string, questionId: string, delta: number) {
    socket?.emit('host:override', { playerId, questionId, delta }, () => {});
  }

  function getCurrentQuestion() {
    if (!state) return null;
    const round = state.quiz?.rounds?.[state.currentRoundIndex];
    return round?.questions?.[state.currentQuestionIndex] ?? null;
  }

  function getWrongAnswerDisplay(wa: { playerId: string; questionId: string; answer: string | number }) {
    const player = state?.players?.find((p) => p.id === wa.playerId);
    const q = getCurrentQuestion();
    let display = wa.answer;
    if (typeof wa.answer === 'number' && q?.type === 'choice' && q.options?.[wa.answer] !== undefined) {
      display = q.options[wa.answer];
    }
    return player ? `${player.emoji} ${player.name}: ${display}` : String(display);
  }
</script>

<div class="min-h-screen p-6">
  <div class="max-w-4xl mx-auto flex gap-6">
    <div class="flex-1 min-w-0">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-pub-gold">Host: {roomId}</h1>
      <p class="text-pub-muted text-sm">{state?.quiz?.meta?.name ?? 'Loading...'}</p>
    </div>

    {#if state?.type === 'Lobby'}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Waiting for players</h2>
        <p class="text-pub-muted mb-4">Share this code: <span class="text-pub-gold font-mono text-xl">{roomId}</span></p>
        <p class="text-pub-muted mb-4">Players join at: <span class="text-sm break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/play/{roomId}</span></p>
        <div class="space-y-2 mb-6">
          {#each state.players ?? [] as player}
            <div class="flex items-center gap-2">
              <span>{player.emoji}</span>
              <span>{player.name}</span>
            </div>
          {/each}
        </div>
        <div class="flex gap-4">
          <button
            class="px-6 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
            on:click={() => socket?.emit('host:start', {}, () => {})}
          >
            Start Game
          </button>
          <button
            type="button"
            class="px-6 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
            on:click={() => window.open(`/projector/${roomId}`, '_blank', 'width=1280,height=720')}
          >
            Projector
          </button>
        </div>
      </div>
    {:else if state?.type === 'Question' || state?.type === 'RevealAnswer'}
      <div class="bg-pub-darker rounded-lg p-6">
        {#key `${state?.currentRoundIndex ?? 0}-${state?.currentQuestionIndex ?? 0}`}
        {@const q = getCurrentQuestion()}
        {#if q}
          <p class="text-pub-muted text-sm mb-2">
            {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
          </p>
          <p class="text-xl mb-6">{q.text}</p>
          {#if q.image}
            {@const src = getQuestionImageSrc(q.image, state?.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if state?.type === 'Question' && state.timerEndsAt && countdown}
            <p class="text-pub-gold font-mono text-lg mb-4">{$countdown}s</p>
          {/if}
          {#if q.type === 'choice'}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded {q.answer === i ? 'ring-2 ring-pub-gold' : ''}">
                  <div class="flex items-start gap-2">
                    <span class="w-8 text-center text-lg font-semibold text-pub-gold shrink-0">
                      {formatOptionLabel(i, optionLabelStyle)}.
                    </span>
                    <span class="flex-1 break-words">
                      {opt} {#if state?.type === 'RevealAnswer' && q.answer === i}(correct){/if}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'input' && state?.type === 'RevealAnswer'}
            <p class="px-4 py-2 bg-pub-dark rounded ring-2 ring-pub-gold text-pub-gold">
              Correct: {q.answer.filter(Boolean).join(' / ')}
            </p>
          {/if}
          {#if state?.type === 'RevealAnswer' && q.explanation?.trim()}
            <p class="mt-4 px-4 py-3 bg-pub-dark rounded text-pub-muted">
              {q.explanation}
            </p>
          {/if}
        {/if}
        {/key}

        {#if state?.type === 'Question' && state.submissions}
          {@const currentQ = getCurrentQuestion()}
          {@const submitted = state.submissions.filter((s) => s.questionId === currentQ?.id)}
          <p class="text-pub-muted text-sm mt-4">
            {submitted.length} of {(state.players ?? []).length} submitted
          </p>
        {/if}

        <div class="flex gap-4 mt-6 flex-wrap">
          {#if state?.type === 'Question'}
            <button
              class="px-4 py-2 bg-amber-600 rounded-lg font-medium hover:opacity-90"
              on:click={stopTimer}
            >
              Stop Timer
            </button>
          {/if}
          <button
            class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
            on:click={next}
          >
            Next
          </button>
          <button
            type="button"
            class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
            on:click={() => window.open(`/projector/${roomId}`, '_blank', 'width=1280,height=720')}
          >
            Projector
          </button>
        </div>

        {#if state?.type === 'RevealAnswer' && getCurrentQuestion()?.type === 'input' && state.wrongAnswers?.length > 0}
          <div class="mt-6 pt-6 border-t border-pub-muted">
            <h3 class="text-sm font-semibold text-pub-muted mb-2">Wrong answers (Use + or - to adjust points)</h3>
            <div class="flex flex-wrap gap-2">
              {#each state.wrongAnswers as wa}
                <div class="flex items-center gap-1 px-3 py-1 bg-pub-dark rounded text-sm">
                  <span>{getWrongAnswerDisplay(wa)}</span>
                  <button
                    type="button"
                    class="w-6 h-6 flex items-center justify-center rounded bg-green-600/80 hover:bg-green-600 text-white text-xs font-bold"
                    on:click={() => override(wa.playerId, wa.questionId, 1)}
                    title="Award point"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    class="w-6 h-6 flex items-center justify-center rounded bg-red-900/80 hover:bg-red-900 text-white text-xs font-bold"
                    on:click={() => override(wa.playerId, wa.questionId, -1)}
                    title="Remove point"
                  >
                    −
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else if state?.type === 'Scoreboard'}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-xl font-bold mb-6">Leaderboard</h2>
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
        <div class="flex gap-4 mt-6">
          <button
            class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
            on:click={next}
          >
            {state.currentRoundIndex < (state.quiz?.rounds?.length ?? 0) - 1 ? 'Next Round' : 'Finish'}
          </button>
          <button
            type="button"
            class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
            on:click={() => window.open(`/projector/${roomId}`, '_blank', 'width=1280,height=720')}
          >
            Projector
          </button>
        </div>
      </div>
    {:else if state?.type === 'End'}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-2xl font-bold text-pub-gold mb-6">Game Over!</h2>
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
        <div class="mt-6 flex gap-4 flex-wrap">
          <a
            href="/?host=1"
            class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
          >
            New Game
          </a>
          <button
            type="button"
            class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
            on:click={() => window.open(`/projector/${roomId}`, '_blank', 'width=1280,height=720')}
          >
            Projector
          </button>
          <a href="/" class="text-pub-accent hover:underline self-center">Back to home</a>
        </div>
      </div>
    {:else if joinError === 'Invalid password'}
      <div class="bg-pub-darker rounded-lg p-6">
        <p class="text-pub-muted mb-4">Re-enter password to join host view</p>
        <form
          class="flex gap-2"
          on:submit|preventDefault={() => doHostJoin(hostRejoinPassword)}
        >
          <input
            type="password"
            bind:value={hostRejoinPassword}
            placeholder="Password"
            class="flex-1 bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
          />
          <button type="submit" class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90">
            Join
          </button>
        </form>
      </div>
    {:else if joinError}
      <p class="text-red-500">{joinError}</p>
      <a href="/" class="mt-4 text-pub-accent hover:underline block">Back to home</a>
    {:else}
      <p class="text-pub-muted">Connecting...</p>
    {/if}
    </div>
    {#if state && (state.type === 'Lobby' || state.type === 'Question' || state.type === 'RevealAnswer' || state.type === 'Scoreboard' || state.type === 'End')}
      <div class="w-64 flex-shrink-0">
        <div class="bg-pub-darker rounded-lg p-4 sticky top-6">
          <h3 class="text-sm font-semibold text-pub-muted mb-3">Leaderboard</h3>
          <ol class="space-y-2 text-sm">
            {#each (state.players ?? []).sort((a, b) => b.score - a.score) as player, i}
              <li class="flex items-center gap-2">
                <span class="text-pub-gold font-bold w-6">#{i + 1}</span>
                <span>{player.emoji}</span>
                <span class="truncate">{player.name}</span>
                <span class="ml-auto font-bold">{player.score}</span>
              </li>
            {/each}
          </ol>
          {#if (state.players ?? []).length === 0}
            <p class="text-pub-muted text-sm">No players yet</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
