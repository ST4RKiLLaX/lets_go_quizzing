<script lang="ts">
  import { page } from '$app/stores';
  import { createSocket } from '$lib/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
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

  $: timerEndsAt = state?.type === 'Question' ? state.timerEndsAt : undefined;
  $: {
    countdown?.destroy?.();
    countdown = useCountdown(timerEndsAt);
  }
  onDestroy(() => countdown?.destroy?.());
  let socket: ReturnType<typeof createSocket> | null = null;

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

  $: answeredList = state?.type === 'Question' ? getAnsweredInOrder() : [];

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

<div class="min-h-screen p-8 flex flex-col items-center justify-center">
  <div class="w-full max-w-4xl">
    {#if state?.type === 'Lobby'}
      <div class="text-center">
        <h2 class="text-3xl font-bold mb-6">Waiting for host to start</h2>
        <p class="text-2xl text-pub-muted mb-6">Room: <span class="text-pub-gold font-mono">{roomId}</span></p>
        {#if joinUrl}
          <p class="text-lg text-pub-muted mb-4">Scan to join</p>
          <canvas
            bind:this={qrCanvas}
            class="mx-auto rounded-lg min-w-[256px] min-h-[256px] [image-rendering:pixelated]"
          ></canvas>
        {/if}
      </div>
    {:else if state?.type === 'Question'}
      <div class="bg-pub-darker rounded-lg p-8" data-question-id={getCurrentQuestion()?.id}>
        {#key `${state?.currentRoundIndex}-${state?.currentQuestionIndex}-${(state?.submissions?.length ?? 0)}`}
        {#if getCurrentQuestion()}
          {@const q = getCurrentQuestion()}
          <p class="text-pub-muted text-lg mb-2">
            {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
          </p>
          <p class="text-3xl mb-8">{q.text}</p>
          {#if state.timerEndsAt && countdown}
            <p class="text-pub-gold font-mono text-2xl mb-6">{$countdown}s</p>
          {/if}
          {#if q.type === 'choice'}
            <ul class="space-y-3">
              {#each q.options ?? [] as opt}
                <li class="px-6 py-4 bg-pub-dark rounded-lg text-xl">{opt}</li>
              {/each}
            </ul>
          {:else if q.type === 'input'}
            <p class="text-xl text-pub-muted">Fill in the blank</p>
          {/if}
        {/if}
        <div class="mt-8 pt-6 border-t border-pub-muted">
          <p class="text-lg text-pub-muted mb-2">Answered</p>
          <p class="text-2xl">
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
      <div class="bg-pub-darker rounded-lg p-8">
        {#if getCurrentQuestion()}
          {@const q = getCurrentQuestion()}
          <p class="text-2xl mb-6">{q.text}</p>
          {#if q.type === 'choice'}
            <ul class="space-y-3">
              {#each q.options ?? [] as opt, i}
                <li class="px-6 py-4 bg-pub-dark rounded-lg text-xl {q.answer === i ? 'ring-2 ring-pub-gold text-pub-gold' : ''}">
                  {opt} {#if q.answer === i}(correct){/if}
                </li>
              {/each}
            </ul>
          {:else if q.type === 'input'}
            <p class="px-6 py-4 bg-pub-dark rounded-lg ring-2 ring-pub-gold text-pub-gold text-xl">
              Correct: {(q.answer ?? []).filter(Boolean).join(' / ')}
            </p>
          {/if}
        {/if}
        <p class="mt-8 text-xl text-pub-muted">Waiting for next question...</p>
      </div>
    {:else if state?.type === 'Scoreboard' || state?.type === 'End'}
      <div class="bg-pub-darker rounded-lg p-8">
        <h2 class="text-3xl font-bold mb-8">
          {state.type === 'End' ? 'Final ' : ''}Leaderboard
        </h2>
        <ol class="space-y-4">
          {#each (state.players ?? []).sort((a, b) => b.score - a.score) as player, i}
            <li class="flex items-center gap-6 text-2xl">
              <span class="text-pub-gold font-bold w-12">#{i + 1}</span>
              <span class="text-3xl">{player.emoji}</span>
              <span>{player.name}</span>
              <span class="ml-auto font-bold">{player.score}</span>
            </li>
          {/each}
        </ol>
      </div>
    {:else}
      <p class="text-2xl text-pub-muted text-center">Connecting...</p>
    {/if}
  </div>
</div>
