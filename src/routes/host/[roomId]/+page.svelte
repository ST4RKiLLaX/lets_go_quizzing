<script lang="ts">
  import { page } from '$app/stores';
  import { socketStore } from '$lib/stores/socket.js';
  import { onMount } from 'svelte';

  const roomId = $page.params.roomId;

  interface SerializedState {
    type: string;
    quiz: { meta: { name: string }; rounds: Array<{ name: string; questions: Array<unknown> }> };
    players: Array<{ id: string; name: string; emoji: string; score: number }>;
    currentRoundIndex: number;
    currentQuestionIndex: number;
    wrongAnswers: Array<{ playerId: string; questionId: string; answer: string | number }>;
  }

  let state: SerializedState | null = null;
  let socket: import('socket.io-client').Socket | null = null;

  onMount(() => {
    socket = socketStore.get() ?? socketStore.connect();
    socket.emit('host:get_state', { roomId }, (ack: { state?: SerializedState }) => {
      if (ack?.state) state = ack.state;
    });
    socket.on('state:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });
    socket.on('room:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });
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

  function override(playerId: string, questionId: string) {
    socket?.emit('host:override', { playerId, questionId }, () => {});
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
  <div class="max-w-2xl mx-auto">
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
        <button
          class="px-6 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
          on:click={() => socket?.emit('host:start', {}, () => {})}
        >
          Start Game
        </button>
      </div>
    {:else if state?.type === 'Question' || state?.type === 'RevealAnswer'}
      <div class="bg-pub-darker rounded-lg p-6">
        {#if getCurrentQuestion()}
          {@const q = getCurrentQuestion()}
          <p class="text-pub-muted text-sm mb-2">
            {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
          </p>
          <p class="text-xl mb-6">{q.text}</p>
          {#if q.type === 'choice'}
            <ul class="space-y-2">
              {#each q.options ?? [] as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded {q.answer === i ? 'ring-2 ring-pub-gold' : ''}">
                  {opt} {#if state?.type === 'RevealAnswer' && q.answer === i}(correct){/if}
                </li>
              {/each}
            </ul>
          {/if}
        {/if}

        <div class="flex gap-4 mt-6">
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
        </div>

        {#if state?.type === 'RevealAnswer' && state.wrongAnswers?.length > 0}
          <div class="mt-6 pt-6 border-t border-pub-muted">
            <h3 class="text-sm font-semibold text-pub-muted mb-2">Wrong answers (click to award)</h3>
            <div class="flex flex-wrap gap-2">
              {#each state.wrongAnswers as wa}
                <button
                  class="px-3 py-1 bg-pub-dark rounded text-sm hover:bg-pub-accent/20"
                  on:click={() => override(wa.playerId, wa.questionId)}
                >
                  {getWrongAnswerDisplay(wa)}
                </button>
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
        <div class="mt-6">
          <a href="/" class="text-pub-accent hover:underline">Back to home</a>
        </div>
      </div>
    {:else}
      <p class="text-pub-muted">Connecting...</p>
    {/if}
  </div>
</div>
