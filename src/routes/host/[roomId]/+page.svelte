<script lang="ts">
  import { page } from '$app/stores';
  import HostEndModal from '$lib/components/host/HostEndModal.svelte';
  import HostLeaderboardView from '$lib/components/host/HostLeaderboardView.svelte';
  import HostLiveQuestionPanel from '$lib/components/host/HostLiveQuestionPanel.svelte';
  import HostLobbyContent from '$lib/components/host/HostLobbyContent.svelte';
  import HostQuestionPreviewContent from '$lib/components/host/HostQuestionPreviewContent.svelte';
  import HostRejoinForm from '$lib/components/host/HostRejoinForm.svelte';
  import HostRoomHeader from '$lib/components/host/HostRoomHeader.svelte';
  import HostRoomPrizeConfigModal from '$lib/components/host/HostRoomPrizeConfigModal.svelte';
  import HostSidebar from '$lib/components/host/HostSidebar.svelte';
  import { hostQuizLiveStore } from '$lib/stores/host-quiz-live.js';
  import { hostSessionStore } from '$lib/stores/host-session.js';
  import { socketStore } from '$lib/stores/socket.js';
  import type { SerializedQuestionPatch, SerializedRoomPatch, SerializedState } from '$lib/types/game.js';
  import { createWakeManager } from '$lib/utils/wake-manager.js';
  import {
    getLiveHotspotSubmissions,
    getLiveOptionCounts,
    getLiveSubmittedCount,
  } from '$lib/utils/host-live-question-derivations.js';
  import {
    getClockOffsetMs,
    getSerializedTimerEndsAt,
    isSerializedActiveQuizPhase,
  } from '$lib/utils/quiz-timer-derivations.js';
  import { getQuestionDisplayOptionIndices } from '$lib/utils/shuffle.js';
  import { getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { sortPlayersByScore } from '$lib/utils/players.js';
  import {
    applyRoomPatch,
    isQuestionPatchForCurrentQuestion,
    isQuestionPatchForState,
  } from '$lib/utils/realtime-patches.js';
  import { onMount, onDestroy } from 'svelte';
  import { findUnavailablePrizeId } from '$lib/prizes/config-validation.js';
  import { normalizePrizeTiers } from '$lib/prizes/tiers.js';
  import { toast } from '$lib/stores/toasts.js';
  import { ackToast } from '$lib/utils/socket-ack.js';
  import type { PrizeOption, PrizeTier } from '$lib/types/prizes.js';

  const roomId = $page.params.roomId;

  let state: SerializedState | null = null;
  let questionPatch: SerializedQuestionPatch | null = null;
  let prizeFeatureEnabled = false;
  let prizeOptions: PrizeOption[] = [];
  let prizeDraftEnabled = false;
  let prizeDraftTiers: PrizeTier[] = [];
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
  $: currentQuestionId = currentQuestion?.id;
  $: clockOffsetMs = getClockOffsetMs(state?.serverNow, Date.now());

  $: timerEndsAt = getSerializedTimerEndsAt(state);
  $: isActiveQuizPhase = isSerializedActiveQuizPhase(state);
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
      const nextState = payload.state;
      const previousPatch = questionPatch;
      state = nextState;
      questionPatch = isQuestionPatchForCurrentQuestion(nextState, previousPatch) ? previousPatch : null;
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
      prizeDraftTiers = state?.roomPrizeConfig?.tiers?.map((tier) => ({ ...tier, prizeIds: [...tier.prizeIds] })) ?? [];
    }
  }

  function saveRoomPrizeConfig() {
    const tiers = normalizePrizeTiers(prizeDraftTiers);

    if (prizeDraftEnabled && tiers.length === 0) {
      toast.error('Add at least one prize tier or turn room prizes off.');
      return;
    }
    const unavailablePrizeId = prizeDraftEnabled ? findUnavailablePrizeId(tiers, prizeOptions) : undefined;
    if (unavailablePrizeId) {
      toast.error(
        `${prizeOptions.find((option) => option.id === unavailablePrizeId)?.name ?? 'Selected prize'} is no longer claimable. Update the tier before saving.`
      );
      return;
    }

    socket?.emit(
      'host:set_room_prize_config',
      { enabled: prizeDraftEnabled, tiers },
      ackToast('Failed to save prize config', (ack) => {
        const serialized = (ack as { state?: SerializedState }).state;
        if (serialized) state = serialized;
        showPrizeConfigModal = false;
        toast.success('Room prizes saved.');
      })
    );
  }

  function openPrizeConfigModal() {
    showPrizeConfigModal = true;
  }

  function closePrizeConfigModal() {
    showPrizeConfigModal = false;
  }

  async function copyJoinUrl() {
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
  }

  function getRoomPrizeTierDisabledReason(): string {
    if (prizeOptions.length === 0) {
      return 'No active, unexpired prizes are available. Update prize settings first.';
    }
    if (prizeOptions.every((prize) => prize.remainingQuantity === 0)) {
      return 'All available prizes are fully claimed. Increase quantity or add a new prize in settings.';
    }
    return '';
  }

  $: liveSubmittedCount = getLiveSubmittedCount({
    state,
    currentQuestionId,
    questionPatch,
  });

  $: liveOptionCounts = getLiveOptionCounts({
    state,
    currentQuestionId,
    questionPatch,
  });

  $: liveHotspotSubmissions = getLiveHotspotSubmissions({
    state,
    currentQuestion,
    questionPatch,
  });

  function next() {
    if (state?.type === 'QuestionPreview') {
      socket?.emit('host:start_question', {}, ackToast('Could not start question'));
    } else {
      socket?.emit('host:next', {}, ackToast('Could not advance'));
    }
  }

  function openEndQuizModal() {
    showEndQuizModal = true;
  }

  function closeEndQuizModal() {
    showEndQuizModal = false;
  }

  function confirmEndQuiz() {
    socket?.emit('host:end_game', {}, ackToast('Could not end game'));
    showEndQuizModal = false;
  }

  function override(playerId: string, questionId: string, delta: number) {
    socket?.emit('host:override', { playerId, questionId, delta }, ackToast('Override failed'));
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
    socket?.emit('host:set_submission_visibility', { playerId, questionId, visible }, ackToast('Could not update visibility'));
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
    socket?.emit('host:set_word_visibility', { questionId, word: normWord, visible }, ackToast('Could not update visibility'));
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
  function kick(playerId: string, ban = false) {
    socket?.emit('host:kick', { playerId, ban }, ackToast('Kick failed'));
  }

  function approvePending(playerId: string) {
    socket?.emit('host:approve', { playerId }, ackToast('Approve failed'));
  }

  function denyPending(playerId: string) {
    socket?.emit('host:deny', { playerId }, ackToast('Deny failed'));
  }

  function approveAllPending() {
    socket?.emit('host:approve_all', {}, ackToast('Approve all failed'));
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
    } else if (
      Array.isArray(wa.answer) &&
      (q?.type === 'click_to_match' || q?.type === 'drag_and_drop') &&
      q.items?.length === wa.answer.length
    ) {
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
    <HostRoomHeader
      quizName={state?.quiz?.meta?.name ?? 'Loading...'}
      roomId={roomId ?? ''}
      showEndButton={!!state && state.type !== 'End'}
      onEndQuiz={openEndQuizModal}
    />

    {#if state?.type === 'Lobby'}
      <HostLobbyContent
        roomId={roomId ?? ''}
        {copied}
        {state}
        {prizeFeatureEnabled}
        onCopyJoinUrl={copyJoinUrl}
        onStartGame={() => socket?.emit('host:start', {}, ackToast('Could not start game'))}
        onOpenPrizeConfig={openPrizeConfigModal}
      />
    {:else if state?.type === 'QuestionPreview'}
      {#if currentQuestion}
        <HostQuestionPreviewContent
          {state}
          question={currentQuestion}
          {currentRoundQuestionTotal}
          {currentQuestionNumber}
          {previewElapsedSeconds}
          {hostActionClass}
          {hostActionLabel}
          onNext={next}
        />
      {/if}
    {:else if state?.type === 'Question' || state?.type === 'RevealAnswer'}
      <HostLiveQuestionPanel
        {state}
        roomId={roomId ?? ''}
        {currentQuestion}
        {currentRoundQuestionTotal}
        {currentQuestionNumber}
        {liveSubmittedCount}
        liveOptionCounts={liveOptionCounts}
        liveHotspotSubmissions={liveHotspotSubmissions}
        {optionLabelStyle}
        {totalTimerSeconds}
        showCountdown={!!countdown}
        countdownSecondsRemaining={countdown ? $countdown ?? 0 : 0}
        {hostActionClass}
        {hostActionLabel}
        {visibilityPending}
        onNext={next}
        onToggleSubmissionVisibility={setSubmissionVisibility}
        onToggleWordVisibility={setWordVisibility}
        onOverride={override}
        getDisplay={getWrongAnswerDisplay}
      />
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
      <HostRejoinForm bind:hostRejoinUsername bind:hostRejoinPassword onJoin={doHostJoin} />
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

<HostRoomPrizeConfigModal
  open={showPrizeConfigModal}
  bind:prizeDraftEnabled
  bind:prizeDraftTiers
  {prizeOptions}
  addTierDisabledReason={getRoomPrizeTierDisabledReason()}
  onClose={closePrizeConfigModal}
  onConfirm={saveRoomPrizeConfig}
/>
