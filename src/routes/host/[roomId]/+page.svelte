<script lang="ts">
  import { page } from '$app/stores';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import HostEndModal from '$lib/components/host/HostEndModal.svelte';
  import HostLeaderboardView from '$lib/components/host/HostLeaderboardView.svelte';
  import HostSidebar from '$lib/components/host/HostSidebar.svelte';
  import HotspotEmojiMarker from '$lib/components/HotspotEmojiMarker.svelte';
  import { hostQuizLiveStore } from '$lib/stores/host-quiz-live.js';
  import { hostSessionStore } from '$lib/stores/host-session.js';
  import { socketStore } from '$lib/stores/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import { createWakeManager } from '$lib/utils/wake-manager.js';
  import { getQuestionOptions, getOptionCounts } from '$lib/player/question-helpers.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { getShuffledReorderIndices } from '$lib/utils/shuffle.js';
  import { formatOptionLabel, getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { onMount, onDestroy } from 'svelte';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let joinError = '';
  let hostRejoinUsername = '';
  let hostRejoinPassword = '';
  let showEndQuizModal = false;
  let countdown: ReturnType<typeof useCountdown> | null = null;
  let wakeManager: ReturnType<typeof createWakeManager> | null = null;
  $: optionLabelStyle = getOptionLabelStyle(state?.quiz?.meta);
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
  $: quizLive = state?.type !== 'Lobby' && state?.type !== 'End';
  $: hostQuizLiveStore.set(!!state && quizLive ? { live: true, roomId } : { live: false });
  let hostRejoinPrefilled = false;
  $: if (joinError !== 'Invalid password') {
    hostRejoinPrefilled = false;
  }
  $: if (joinError === 'Invalid password' && !hostRejoinPrefilled && typeof window !== 'undefined') {
    // eslint-disable-next-line no-useless-assignment -- state for next reactive run
    hostRejoinPrefilled = true;
    try {
      hostRejoinUsername = sessionStorage.getItem('lgq_host_username') ?? '';
    } catch {
      /* ignore */
    }
  }
  onDestroy(() => {
    clearHostSession();
    hostQuizLiveStore.set({ live: false });
    countdown?.destroy?.();
    void wakeManager?.destroy();
  });
  let socket: import('socket.io-client').Socket | null = null;

  let hostSessionEstablished = false;

  function markHostSessionEstablished() {
    if (hostSessionEstablished) return;
    hostSessionEstablished = true;
    hostSessionStore.set({ active: true, roomId });
  }

  function clearHostSession() {
    hostSessionEstablished = false;
    hostSessionStore.update((current) => {
      if (current.roomId !== roomId) return current;
      return { active: false };
    });
  }

  function doHostJoin(username?: string, password?: string) {
    joinError = '';
    socket?.emit('host:join', { roomId, username, password }, (ack: { state?: SerializedState; error?: string }) => {
      if (ack?.state) {
        state = ack.state;
        markHostSessionEstablished();
        hostRejoinPassword = '';
      }
      if (ack?.error) {
        joinError = ack.error;
        state = null;
      }
    });
  }

  onMount(() => {
    wakeManager = createWakeManager();

    // Always reconnect on host page so the handshake includes latest auth cookies.
    socket = socketStore.connect();
    let username: string | undefined;
    let pwd: string | undefined;
    try {
      username = sessionStorage.getItem('lgq_host_username') ?? undefined;
      pwd = sessionStorage.getItem('lgq_host_password') ?? undefined;
      // Don't remove - keep for creating new rooms after game ends
    } catch {
      /* ignore */
    }
    doHostJoin(username, pwd);
    const onStateUpdate = (payload: { state: SerializedState }) => {
      state = payload.state;
      if (payload?.state) markHostSessionEstablished();
    };
    const onRoomUpdate = (payload: { state: SerializedState }) => {
      const incoming = payload?.state;
      if (!incoming) return;
      state = incoming;
      markHostSessionEstablished();
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

  function openEndQuizModal() {
    showEndQuizModal = true;
  }

  function closeEndQuizModal() {
    showEndQuizModal = false;
  }

  function confirmEndQuiz() {
    socket?.emit('host:end_game', {}, () => {});
    showEndQuizModal = false;
  }

  function override(playerId: string, questionId: string, delta: number) {
    socket?.emit('host:override', { playerId, questionId, delta }, () => {});
  }

  let kickError = '';
  function kick(playerId: string, ban = false) {
    kickError = '';
    socket?.emit('host:kick', { playerId, ban }, (ack: { ok?: boolean; code?: string; message?: string }) => {
      if (ack?.ok === false) {
        kickError = ack.message ?? ack.code ?? 'Kick failed';
      }
    });
  }

  function approvePending(playerId: string) {
    socket?.emit('host:approve', { playerId }, (ack: { ok?: boolean; code?: string; message?: string }) => {
      if (ack?.ok === false) {
        kickError = ack.message ?? ack.code ?? 'Approve failed';
      }
    });
  }

  function denyPending(playerId: string) {
    socket?.emit('host:deny', { playerId }, (ack: { ok?: boolean; code?: string; message?: string }) => {
      if (ack?.ok === false) {
        kickError = ack.message ?? ack.code ?? 'Deny failed';
      }
    });
  }

  function approveAllPending() {
    socket?.emit('host:approve_all', {}, (ack: { ok?: boolean; code?: string; message?: string }) => {
      if (ack?.ok === false) {
        kickError = ack.message ?? ack.code ?? 'Approve all failed';
      }
    });
  }

  function getWrongAnswerDisplay(wa: { playerId: string; questionId: string; answer: string | number | number[] }) {
    const player = state?.players?.find((p) => p.id === wa.playerId);
    const q = currentQuestion;
    let display = wa.answer;
    if (
      typeof wa.answer === 'number' &&
      (q?.type === 'choice' || q?.type === 'poll' || q?.type === 'multi_select') &&
      q.options?.[wa.answer] !== undefined
    ) {
      display = q.options[wa.answer];
    } else if (Array.isArray(wa.answer) && q?.type === 'multi_select') {
      display = wa.answer.map((index) => q.options[index] ?? String(index)).join(', ');
    } else if (Array.isArray(wa.answer) && q?.type === 'reorder') {
      display = wa.answer.map((index) => q.options[index] ?? String(index)).join(' → ');
    } else if (Array.isArray(wa.answer) && q?.type === 'hotspot' && wa.answer.length >= 2) {
      display = `(${(wa.answer[0] * 100).toFixed(0)}%, ${(wa.answer[1] * 100).toFixed(0)}%)`;
    } else if (typeof wa.answer === 'number' && q?.type === 'true_false') {
      display = wa.answer === 0 ? 'True' : 'False';
    }
    return player ? `${player.emoji} ${player.name}: ${display}` : String(display);
  }
</script>

<div class="min-h-screen p-4 sm:p-6">
  <div class="max-w-4xl mx-auto flex flex-col lg:flex-row gap-4 lg:gap-6">
    <div class="flex-1 min-w-0">
    <div class="mb-4 sm:mb-6">
      <p class="text-pub-gold text-lg sm:text-xl font-semibold mb-2 break-words">
        {state?.quiz?.meta?.name ?? 'Loading...'}
      </p>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 class="text-xl sm:text-2xl font-bold text-pub-gold break-all">Host: {roomId}</h1>
        <div class="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
          <button
            type="button"
            class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
            on:click={() => window.open(`/projector/${roomId}`, '_blank', 'width=1280,height=720')}
          >
            Projector
          </button>
          {#if state && state.type !== 'End'}
            <button
              type="button"
              class="px-4 py-2 bg-[#CF3030] rounded-lg font-medium hover:opacity-90"
              on:click={openEndQuizModal}
            >
              End Quiz
            </button>
          {/if}
        </div>
      </div>
    </div>

    {#if state?.type === 'Lobby'}
      <div class="bg-pub-darker rounded-lg p-4 sm:p-6">
        <h2 class="text-lg font-semibold mb-4">Waiting for players</h2>
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <p class="text-pub-muted">
            Share this code: <span class="text-pub-gold font-mono text-lg sm:text-xl">{roomId}</span>
          </p>
        </div>
        <p class="text-pub-muted mb-4">Players join at: <span class="text-sm break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/play/{roomId}</span></p>
        <div class="flex flex-wrap gap-3 sm:gap-4">
          <button
            class="px-5 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
            on:click={() => socket?.emit('host:start', {}, () => {})}
          >
            Start Game
          </button>
        </div>
      </div>
    {:else if state?.type === 'Question' || state?.type === 'RevealAnswer'}
      <div class="bg-pub-darker rounded-lg p-4 sm:p-6">
        {#key `${state?.currentRoundIndex ?? 0}-${state?.currentQuestionIndex ?? 0}`}
        {#if currentQuestion}
        {@const q = currentQuestion}
          <div class="flex items-start justify-between gap-4 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            {#if countdown}
              <CountdownPie secondsRemaining={$countdown ?? 0} totalSeconds={totalTimerSeconds} />
            {/if}
          </div>
          <p class="text-xl mb-6">{q.text}</p>
          {#if q.type === 'hotspot'}
            {@const hq = q}
            {@const src = getQuestionImageSrc(hq.image, state?.quizFilename)}
            {@const ar = hq.imageAspectRatio ?? 1}
            {@const rY = hq.answer.radiusY ?? hq.answer.radius}
            {@const rot = hq.answer.rotation ?? 0}
            {@const hotspotSubs = (state?.submissions ?? []).filter((s) => s.questionId === q.id && s.answerX != null && s.answerY != null)}
            {#if src}
              <div class="relative inline-block max-w-full my-4">
                <img src={src} alt="" class="max-w-full rounded-lg block" />
                {#if state?.type === 'RevealAnswer'}
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
                {/if}
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
                <li class="px-4 py-2 bg-pub-dark rounded {state?.type === 'RevealAnswer' ? (correctIndex === i ? 'ring-2 ring-green-500' : 'opacity-60') : (correctIndex === i ? 'ring-2 ring-green-500' : '')}">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">
                      {opt} {#if state?.type === 'RevealAnswer' && correctIndex === i}(correct){/if}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'multi_select'}
            {@const counts = getOptionCounts(state?.submissions ?? [], q.id)}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded {state?.type === 'RevealAnswer' ? (q.answer.includes(i) ? 'ring-2 ring-green-500' : 'opacity-60') : ''}">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                      {formatOptionLabel(i, optionLabelStyle)}
                    </span>
                    <span class="flex-1 break-words">
                      {opt} {#if state?.type === 'RevealAnswer' && q.answer.includes(i)}(correct){/if}
                    </span>
                    <span class="text-pub-gold font-semibold">{counts.get(i) ?? 0}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'reorder'}
            <div class="space-y-4">
              <div>
                {#if state?.type === 'RevealAnswer'}
                  <h3 class="text-sm font-semibold text-pub-muted mb-2">Correct Order:</h3>
                {/if}
                <ul class="space-y-2 {state?.type !== 'RevealAnswer' ? 'opacity-60' : ''}">
                  {#each (state?.type === 'RevealAnswer' ? q.answer : getShuffledReorderIndices(q.id, q.options.length)) as optIndex, i}
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
          {:else if q.type === 'poll'}
            {@const counts = getOptionCounts(state?.submissions ?? [], q.id)}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                <li class="px-4 py-2 bg-pub-dark rounded">
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
            {@const visibleSubs = (state.submissions ?? []).filter(s => s.questionId === q.id && s.visibility !== 'blocked')}
            {@const blockedCount = (state.submissions ?? []).filter(s => s.questionId === q.id && s.visibility === 'blocked').length}
            <div class="space-y-2 mt-4">
              <h3 class="text-sm font-semibold text-pub-muted">Responses:</h3>
              <ul class="space-y-1">
                {#each visibleSubs as sub}
                  {@const player = state.players.find(p => p.id === sub.playerId)}
                  <li class="px-4 py-2 bg-pub-dark rounded text-sm">
                    <span class="text-pub-muted mr-2">{player?.emoji} {player?.name}:</span>
                    {sub.answerText}
                  </li>
                {/each}
              </ul>
              {#if blockedCount > 0}
                <p class="text-sm text-pub-muted italic">{blockedCount} blocked response{blockedCount === 1 ? '' : 's'}</p>
              {/if}
            </div>
          {:else if q.type === 'word_cloud' && state?.type === 'RevealAnswer'}
            {@const visibleSubs = (state.submissions ?? []).filter(s => s.questionId === q.id && s.visibility !== 'blocked')}
            {@const blockedCount = (state.submissions ?? []).filter(s => s.questionId === q.id && s.visibility === 'blocked').length}
            <div class="mt-4 flex flex-wrap gap-3 justify-center items-center p-6 bg-pub-dark rounded min-h-[150px]">
              {#each Array.from(
                visibleSubs.reduce((acc, s) => {
                  const text = (s.answerText || '').trim().toUpperCase();
                  if (text) acc.set(text, (acc.get(text) || 0) + 1);
                  return acc;
                }, new Map<string, number>())
              ).sort((a, b) => b[1] - a[1]) as [word, count]}
                <span style="font-size: {Math.max(1, Math.min(3.5, 0.9 + count * 0.3))}rem; opacity: {Math.min(1, 0.5 + count * 0.2)}" class="text-pub-gold font-bold leading-none inline-block">
                  {word}
                </span>
              {/each}
            </div>
            {#if blockedCount > 0}
              <p class="text-sm text-pub-muted italic mt-2">{blockedCount} blocked response{blockedCount === 1 ? '' : 's'}</p>
            {/if}
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
          {@const submitted = state.submissions.filter((s) => s.questionId === currentQuestion?.id)}
          <p class="text-pub-muted text-sm mt-4">
            {submitted.length} of {(state.players ?? []).length} submitted
          </p>
        {/if}

        <div class="flex gap-4 mt-6 flex-wrap items-center">
          <button
            class="px-4 py-2 bg-green-600 rounded-lg font-medium hover:opacity-90 ml-auto"
            on:click={next}
          >
            Next
          </button>
        </div>

          {#if state?.type === 'RevealAnswer' && (currentQuestion?.type === 'input' || currentQuestion?.type === 'true_false' || currentQuestion?.type === 'multi_select' || currentQuestion?.type === 'slider' || currentQuestion?.type === 'reorder' || currentQuestion?.type === 'hotspot') && state.wrongAnswers?.length > 0}
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
      <HostLeaderboardView
        title="Leaderboard"
        isEnd={false}
        players={(state.players ?? []).sort((a, b) => b.score - a.score)}
        roomId={roomId ?? ''}
        onNext={next}
        nextLabel={state.currentRoundIndex < (state.quiz?.rounds?.length ?? 0) - 1 ? 'Next Round' : 'Finish'}
        showProjectorButton={true}
      />
    {:else if state?.type === 'End'}
      <HostLeaderboardView
        title="Game Over!"
        isEnd={true}
        players={(state.players ?? []).sort((a, b) => b.score - a.score)}
        roomId={roomId ?? ''}
        showProjectorButton={true}
      />
    {:else if joinError === 'Invalid password'}
      <div class="bg-pub-darker rounded-lg p-4 sm:p-6">
        <p class="text-pub-muted mb-4">Re-enter username and password to join host view</p>
        <form
          class="flex flex-col gap-2"
          on:submit|preventDefault={() => doHostJoin(hostRejoinUsername, hostRejoinPassword)}
        >
          <input
            type="text"
            bind:value={hostRejoinUsername}
            placeholder="Username"
            class="flex-1 bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
          />
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
      <HostSidebar
        state={state}
        kickError={kickError}
        onKick={kick}
        onApprove={approvePending}
        onDeny={denyPending}
        onApproveAll={approveAllPending}
      />
    {/if}
  </div>
</div>

<HostEndModal
  open={showEndQuizModal}
  onClose={closeEndQuizModal}
  onConfirm={confirmEndQuiz}
/>
