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
  import type { SerializedQuestionPatch, SerializedRoomPatch, SerializedState } from '$lib/types/game.js';
  import { createWakeManager } from '$lib/utils/wake-manager.js';
  import { getQuestionOptions, getOptionCounts } from '$lib/player/question-helpers.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { getShuffledReorderIndices } from '$lib/utils/shuffle.js';
  import { formatOptionLabel, getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { sortPlayersByScore } from '$lib/utils/players.js';
  import { applyRoomPatch, isQuestionPatchForState } from '$lib/utils/realtime-patches.js';
  import { onMount, onDestroy } from 'svelte';
  import {
    QUESTION_MECHANIC_REMINDER,
    QUESTION_TYPE_LABELS,
  } from '$lib/constants/question-copy.js';
  import RevealChoiceTrueFalseList from '$lib/components/shared/question-display/RevealChoiceTrueFalseList.svelte';
  import RevealMultiSelectList from '$lib/components/shared/question-display/RevealMultiSelectList.svelte';
  import PollOptionsList from '$lib/components/shared/question-display/PollOptionsList.svelte';
  import HostWrongAnswersStrip from '$lib/components/host/HostWrongAnswersStrip.svelte';
  import HostOpenEndedRevealModeration from '$lib/components/host/HostOpenEndedRevealModeration.svelte';
  import HostWordCloudRevealModeration from '$lib/components/host/HostWordCloudRevealModeration.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import PrizeTierEditor from '$lib/components/prizes/PrizeTierEditor.svelte';
  import type { PrizeOption, PrizeTier } from '$lib/types/prizes.js';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let questionPatch: SerializedQuestionPatch | null = null;
  let prizeFeatureEnabled = false;
  let prizeOptions: PrizeOption[] = [];
  let prizeDraftEnabled = false;
  let prizeDraftTiers: PrizeTier[] = [];
  let prizeConfigError = '';
  let showPrizeConfigModal = false;
  let lastSyncedPrizeConfig = '';
  let copied = false;
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
  $: isLastQuestionInRound =
    currentRoundQuestionTotal > 0 && currentQuestionNumber >= currentRoundQuestionTotal;
  $: hostActionLabel =
    state?.type === 'QuestionPreview'
      ? 'Start Question'
      : state?.type === 'Question'
        ? 'Reveal'
        : state?.type === 'RevealAnswer'
          ? isLastQuestionInRound
            ? 'Leaderboard'
            : 'Next'
          : 'Next';
  $: hostActionClass =
    state?.type === 'QuestionPreview'
      ? 'bg-pub-accent'
      : state?.type === 'Question'
        ? 'bg-amber-600'
        : state?.type === 'RevealAnswer'
          ? 'bg-green-600'
          : 'bg-green-600';
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
    if (previewIntervalId) clearInterval(previewIntervalId);
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
        questionPatch = null;
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
    void loadPrizeOptions();
    const onStateUpdate = (payload: { state: SerializedState }) => {
      state = payload.state;
      questionPatch = null;
      clearVisibilityPending();
      if (payload?.state) markHostSessionEstablished();
    };
    const onRoomPatch = (payload: { patch?: SerializedRoomPatch }) => {
      if (!payload?.patch) return;
      state = applyRoomPatch(state, payload.patch);
      clearVisibilityPending();
      markHostSessionEstablished();
    };
    const onQuestionPatch = (payload: { patch?: SerializedQuestionPatch }) => {
      if (!payload?.patch || !isQuestionPatchForState(state, payload.patch)) return;
      questionPatch = payload.patch;
    };
    socket.on('state:update', onStateUpdate);
    socket.on('room:patch', onRoomPatch);
    socket.on('question:patch', onQuestionPatch);
    return () => {
      socket?.off('state:update', onStateUpdate);
      socket?.off('room:patch', onRoomPatch);
      socket?.off('question:patch', onQuestionPatch);
    };
  });

  async function loadPrizeOptions() {
    try {
      const res = await fetch('/api/prizes/options');
      const data = await res.json();
      prizeFeatureEnabled = data.enabled === true;
      prizeOptions = data.prizes ?? [];
    } catch {
      prizeFeatureEnabled = false;
      prizeOptions = [];
    }
  }

  $: {
    const signature = JSON.stringify(state?.roomPrizeConfig ?? null);
    if (signature !== lastSyncedPrizeConfig) {
      lastSyncedPrizeConfig = signature;
      prizeDraftEnabled = state?.roomPrizeConfig?.enabled ?? false;
      prizeDraftTiers = state?.roomPrizeConfig?.tiers?.map((tier) => ({ ...tier })) ?? [];
    }
  }

  function saveRoomPrizeConfig() {
    prizeConfigError = '';
    const tiers = prizeDraftTiers
      .map((tier) => ({
        minScore: Math.max(0, Math.floor(Number(tier.minScore) || 0)),
        prizeId: tier.prizeId,
        label: tier.label?.trim() || undefined,
      }))
      .filter((tier) => tier.prizeId);

    if (prizeDraftEnabled && tiers.length === 0) {
      prizeConfigError = 'Add at least one prize tier or turn room prizes off.';
      return;
    }

    socket?.emit(
      'host:set_room_prize_config',
      { enabled: prizeDraftEnabled, tiers },
      (ack: { ok?: boolean; error?: string; state?: SerializedState }) => {
        if (ack?.error) {
          prizeConfigError = ack.error;
          return;
        }
        if (ack?.state) {
          state = ack.state;
        }
        showPrizeConfigModal = false;
      }
    );
  }

  function openPrizeConfigModal() {
    prizeConfigError = '';
    showPrizeConfigModal = true;
  }

  function closePrizeConfigModal() {
    showPrizeConfigModal = false;
  }

  function getLiveSubmittedCount(questionId: string | undefined): number {
    if (!questionId) return 0;
    if (state?.type === 'Question' && questionPatch?.questionId === questionId) {
      return questionPatch.submittedCount;
    }
    return (state?.submissions ?? []).filter((submission) => submission.questionId === questionId).length;
  }

  function getLiveOptionCounts(questionId: string): Map<number, number> {
    if (state?.type === 'Question' && questionPatch?.questionId === questionId && questionPatch.optionCounts) {
      return new Map(
        Object.entries(questionPatch.optionCounts).map(([index, count]) => [Number(index), count])
      );
    }
    return getOptionCounts(state?.submissions ?? [], questionId);
  }

  function getLiveHotspotSubmissions(questionId: string) {
    if (state?.type === 'Question' && questionPatch?.questionId === questionId && questionPatch.hotspotSubmissions) {
      return questionPatch.hotspotSubmissions;
    }
    return (state?.submissions ?? []).filter(
      (submission) =>
        submission.questionId === questionId &&
        submission.answerX != null &&
        submission.answerY != null &&
        submission.visibility !== 'blocked' &&
        !submission.projectorHiddenByHost
    );
  }

  function next() {
    if (state?.type === 'QuestionPreview') {
      socket?.emit('host:start_question', {}, () => {});
    } else {
      socket?.emit('host:next', {}, () => {});
    }
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

  let visibilityPending: string | null = null;
  let visibilityPendingTimeout: ReturnType<typeof setTimeout> | null = null;
  const VISIBILITY_TIMEOUT_MS = 5000;

  function setSubmissionVisibility(playerId: string, questionId: string, visible: boolean) {
    const key = `sub:${playerId}:${questionId}`;
    if (visibilityPending === key) return;
    visibilityPending = key;
    visibilityPendingTimeout = setTimeout(() => {
      visibilityPending = null;
      visibilityPendingTimeout = null;
    }, VISIBILITY_TIMEOUT_MS);
    socket?.emit('host:set_submission_visibility', { playerId, questionId, visible }, () => {});
  }

  function setWordVisibility(questionId: string, word: string, visible: boolean) {
    const normWord = word.trim().toUpperCase();
    const key = `word:${questionId}:${normWord}`;
    if (visibilityPending === key) return;
    visibilityPending = key;
    visibilityPendingTimeout = setTimeout(() => {
      visibilityPending = null;
      visibilityPendingTimeout = null;
    }, VISIBILITY_TIMEOUT_MS);
    socket?.emit('host:set_word_visibility', { questionId, word: normWord, visible }, () => {});
  }

  function clearVisibilityPending() {
    visibilityPending = null;
    if (visibilityPendingTimeout) {
      clearTimeout(visibilityPendingTimeout);
      visibilityPendingTimeout = null;
    }
  }

  let previewElapsedSeconds = 0;
  let previewIntervalId: ReturnType<typeof setInterval> | null = null;
  $: {
    if (state?.type === 'QuestionPreview') {
      if (previewIntervalId) clearInterval(previewIntervalId);
      previewElapsedSeconds = 0;
      previewIntervalId = setInterval(() => {
        previewElapsedSeconds += 1;
      }, 1000);
    } else {
      if (previewIntervalId) {
        clearInterval(previewIntervalId);
        previewIntervalId = null;
      }
      previewElapsedSeconds = 0;
    }
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
    } else if (Array.isArray(wa.answer) && q?.type === 'matching' && q.items?.length === wa.answer.length) {
      const indexes = wa.answer as number[];
      display = q.items
        .map((item, i) => `${item} → ${q.options[indexes[i]] ?? String(indexes[i])}`)
        .join(', ');
    } else if (Array.isArray(wa.answer) && q?.type === 'hotspot' && wa.answer.length >= 2) {
      display = `(${(wa.answer[0] * 100).toFixed(0)}%, ${(wa.answer[1] * 100).toFixed(0)}%)`;
    } else if (typeof wa.answer === 'number' && q?.type === 'true_false') {
      display = wa.answer === 0 ? 'True' : 'False';
    }
    return player ? `${player.emoji} ${player.name}: ${display}` : String(display);
  }
</script>

<div class="min-h-full p-4 sm:p-6">
  <div class="max-w-4xl mx-auto flex flex-col lg:flex-row gap-4 lg:gap-6">
    <div class="flex-1 min-w-0">
    <div class="mb-4 sm:mb-6">
      <p class="text-pub-gold text-lg sm:text-xl font-semibold mb-2 break-words">
        {state?.quiz?.meta?.name ?? 'Loading...'}
      </p>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 class="text-xl sm:text-2xl font-bold text-pub-gold break-all">Host: {roomId}</h1>
        <div class="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
          {#if state && state.type !== 'End'}
            <button
              type="button"
              class="px-4 py-2 bg-[#CF3030] rounded-lg font-medium hover:opacity-90"
              onclick={openEndQuizModal}
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
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <p class="text-pub-muted">
            Players join at: <span class="text-sm break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/play/{roomId}</span>
          </p>
          <button
            type="button"
            class="px-3 py-1.5 text-sm bg-pub-dark hover:bg-pub-accent/30 rounded-lg font-medium text-pub-gold shrink-0"
            onclick={async () => {
              const url = typeof window !== 'undefined' ? `${window.location.origin}/play/${roomId}` : '';
              try {
                await navigator.clipboard.writeText(url);
                copied = true;
                setTimeout(() => (copied = false), 2000);
              } catch {
                // fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copied = true;
                setTimeout(() => (copied = false), 2000);
              }
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div class="flex flex-wrap gap-3 sm:gap-4">
          <button
            class="px-5 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90"
            onclick={() => socket?.emit('host:start', {}, () => {})}
          >
            Start Game
          </button>
        </div>
        {#if prizeFeatureEnabled}
          <div class="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="px-4 py-2 bg-pub-dark border border-pub-muted rounded-lg font-medium text-pub-gold hover:bg-pub-accent/20"
              onclick={openPrizeConfigModal}
            >
              Room Prizes
            </button>
            {#if state?.roomPrizeConfig?.enabled}
              <span class="text-sm text-pub-muted">
                {state.roomPrizeConfig.tiers.length} tier{state.roomPrizeConfig.tiers.length === 1 ? '' : 's'} configured
              </span>
            {:else}
              <span class="text-sm text-pub-muted">No room prize tiers configured.</span>
            {/if}
          </div>
        {/if}
      </div>
    {:else if state?.type === 'QuestionPreview'}
      {#if currentQuestion}
        {@const q = currentQuestion}
        <div class="bg-pub-darker rounded-lg p-4 sm:p-6">
          <div class="flex items-start justify-between gap-4 mb-2">
            <p class="text-pub-gold text-base font-semibold">
              {state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
            </p>
            <span class="text-pub-muted text-sm tabular-nums">{Math.floor(previewElapsedSeconds / 60)}:{String(previewElapsedSeconds % 60).padStart(2, '0')}</span>
          </div>
          <span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-pub-dark text-pub-muted mb-3">
            {QUESTION_TYPE_LABELS[q.type] ?? q.type}
          </span>
          <p class="text-xl mb-4">{q.text}</p>
          {#if q.type === 'hotspot' && q.image}
            {@const src = getQuestionImageSrc(q.image, state?.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {:else if q.image}
            {@const src = getQuestionImageSrc(q.image, state?.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          <p class="text-sm text-pub-muted mb-6">{QUESTION_MECHANIC_REMINDER[q.type] ?? ''}</p>
          {#if currentRoundQuestionTotal > 0}
            <p class="text-center text-sm font-medium text-pub-muted mb-4">
              {currentQuestionNumber}/{currentRoundQuestionTotal}
            </p>
          {/if}
          <div class="flex gap-4 mt-6 flex-wrap items-center">
            <button
              class="px-4 py-2 {hostActionClass} rounded-lg font-medium hover:opacity-90 ml-auto"
              onclick={next}
            >
              {hostActionLabel}
            </button>
          </div>
        </div>
      {/if}
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
            {@const hotspotSubs = getLiveHotspotSubmissions(q.id)}
            {#if src}
              <div class="relative inline-block max-w-full my-4">
                <img src={src} alt="" class="max-w-full rounded-lg block" />
                {#if state?.type === 'RevealAnswer'}
                  <div
                    class="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none rounded-full origin-center"
                    style="left: {((hq.answer.x - hq.answer.radius / ar) * 100)}%; top: {((hq.answer.y - rY) * 100)}%; width: {(hq.answer.radius * 2 / ar) * 100}%; height: {(rY * 2) * 100}%; transform: rotate({rot}deg);"
                  ></div>
                {/if}
                {#each hotspotSubs as sub}
                  {@const player = (state?.players ?? []).find((p) => p.id === sub.playerId)}
                  {@const isWrong = state?.wrongAnswers?.some((w) => w.playerId === sub.playerId && w.questionId === q.id)}
                  <HotspotEmojiMarker
                    x={sub.answerX!}
                    y={sub.answerY!}
                    emoji={player?.emoji ?? '?'}
                    name={player?.name ?? 'Unknown'}
                    isWrong={isWrong}
                    showCorrectness={state?.type === 'RevealAnswer'}
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
            {#if state?.type === 'RevealAnswer'}
              {@const correctIndex = q.type === 'choice' ? q.answer : q.answer ? 0 : 1}
              <RevealChoiceTrueFalseList {options} {correctIndex} {optionLabelStyle} />
            {:else}
              <ul class="space-y-2">
                {#each options as opt, i}
                  {@const correctIndex = q.type === 'choice' ? q.answer : q.answer ? 0 : 1}
                  <li
                    class="px-4 py-2 bg-pub-dark rounded {correctIndex === i
                      ? 'ring-2 ring-green-500'
                      : ''}"
                  >
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
            {/if}
          {:else if q.type === 'multi_select'}
            {@const counts = getLiveOptionCounts(q.id)}
            {#if state?.type === 'RevealAnswer'}
              <RevealMultiSelectList
                options={q.options}
                correctIndices={q.answer}
                {counts}
                {optionLabelStyle}
              />
            {:else}
              <ul class="space-y-2">
                {#each q.options as opt, i}
                  <li class="px-4 py-2 bg-pub-dark rounded">
                    <div class="flex items-center gap-2">
                      <span
                        class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
                      >
                        {formatOptionLabel(i, optionLabelStyle)}
                      </span>
                      <span class="flex-1 break-words">{opt}</span>
                      <span class="text-pub-gold font-semibold">{counts.get(i) ?? 0}</span>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
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
          {:else if q.type === 'matching'}
            <div class="space-y-4">
              {#if state?.type === 'RevealAnswer'}
                <h3 class="text-sm font-semibold text-pub-muted mb-2">Correct Pairs:</h3>
              {/if}
              <div class="flex gap-4 flex-col sm:flex-row">
                <div class="flex-1">
                  <p class="text-sm font-medium text-pub-muted mb-2">Items</p>
                  <ul class="space-y-2">
                    {#each q.items as item, i}
                      <li class="px-4 py-2 bg-pub-dark rounded {state?.type === 'RevealAnswer' ? 'ring-2 ring-green-500' : ''}">
                        <span class="font-medium">{item}</span>
                        {#if state?.type === 'RevealAnswer'}
                          <span class="block text-pub-gold text-sm mt-1">→ {q.options[q.answer[i]]}</span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
                {#if state?.type !== 'RevealAnswer'}
                  <div class="flex-1">
                    <p class="text-sm font-medium text-pub-muted mb-2">Options</p>
                    <ul class="space-y-2 opacity-60">
                      {#each getShuffledReorderIndices(q.id + ':options', q.options.length) as optIndex}
                        <li class="px-4 py-2 bg-pub-dark rounded">
                          <span class="break-words">{q.options[optIndex]}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            </div>
          {:else if q.type === 'poll'}
            {@const counts = getLiveOptionCounts(q.id)}
            <PollOptionsList
              options={q.options}
              {optionLabelStyle}
              showCounts={state?.type === 'RevealAnswer'}
              {counts}
              itemRoundedClass="rounded"
            />
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
            <HostOpenEndedRevealModeration
              {state}
              questionId={q.id}
              {visibilityPending}
              onToggleSubmissionVisibility={setSubmissionVisibility}
            />
          {:else if q.type === 'word_cloud' && state?.type === 'RevealAnswer'}
            <HostWordCloudRevealModeration
              {state}
              questionId={q.id}
              {visibilityPending}
              onToggleWordVisibility={setWordVisibility}
            />
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
          <p class="text-pub-muted text-sm mt-4">
            {getLiveSubmittedCount(currentQuestion?.id)} of {(state.players ?? []).length} submitted
          </p>
        {/if}

        <div class="flex gap-4 mt-6 flex-wrap items-center">
          <button
            class="px-4 py-2 {hostActionClass} rounded-lg font-medium hover:opacity-90 ml-auto"
            onclick={next}
          >
            {hostActionLabel}
          </button>
        </div>

        <HostWrongAnswersStrip
          {state}
          currentQuestion={currentQuestion}
          getDisplay={getWrongAnswerDisplay}
          onOverride={override}
        />
      </div>
    {:else if state?.type === 'Scoreboard'}
      <HostLeaderboardView
        title="Leaderboard"
        isEnd={false}
        players={sortPlayersByScore(state.players)}
        onNext={next}
        nextLabel={state.currentRoundIndex < (state.quiz?.rounds?.length ?? 0) - 1 ? 'Next Round' : 'Finish'}
      />
    {:else if state?.type === 'End'}
      <HostLeaderboardView
        title="Game Over!"
        isEnd={true}
        players={sortPlayersByScore(state.players)}
      />
    {:else if joinError === 'Invalid password'}
      <div class="bg-pub-darker rounded-lg p-4 sm:p-6">
        <p class="text-pub-muted mb-4">Re-enter username and password to join host view</p>
        <form
          class="flex flex-col gap-2"
          onsubmit={(e) => { e.preventDefault(); doHostJoin(hostRejoinUsername, hostRejoinPassword); }}
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
    {#if state && (state.type === 'Lobby' || state.type === 'QuestionPreview' || state.type === 'Question' || state.type === 'RevealAnswer' || state.type === 'Scoreboard' || state.type === 'End')}
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

<ConfirmModal
  open={showPrizeConfigModal}
  title="Room prizes"
  titleId="host-room-prizes-modal-title"
  cancelLabel="Close"
  confirmLabel="Save Prize Config"
  confirmButtonClass="bg-pub-accent text-white"
  onClose={closePrizeConfigModal}
  onConfirm={saveRoomPrizeConfig}
>
  <div class="mb-4 space-y-4">
    <PrizeTierEditor
      bind:enabled={prizeDraftEnabled}
      bind:tiers={prizeDraftTiers}
      availablePrizes={prizeOptions}
      title="Room prizes"
      subtitle="Optional score tiers for this room. You can edit these until the game starts."
      emptyMessage="No room prize tiers configured."
    />
    {#if prizeConfigError}
      <p class="text-sm text-red-400">{prizeConfigError}</p>
    {/if}
  </div>
</ConfirmModal>
