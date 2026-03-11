<script lang="ts">
  import { page } from '$app/stores';
  import CountdownPie from '$lib/components/CountdownPie.svelte';
  import PlayerConfetti from '$lib/components/PlayerConfetti.svelte';
  import PlayerNav from '$lib/components/PlayerNav.svelte';
  import { createSocket, getOrCreatePlayerId } from '$lib/socket.js';
  import type { SerializedState } from '$lib/types/game.js';
  import type { Question, HotspotQuestion } from '$lib/types/quiz.js';
  import { createWakeManager, type WakeSnapshot } from '$lib/utils/wake-manager.js';
  import { getQuestionImageSrc } from '$lib/utils/image-url.js';
  import { getShuffledReorderIndices } from '$lib/utils/shuffle.js';
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
  let wakeRequested = false;
  let wakeAutoAttempted = false;
  let wakeAutoAttemptInFlight = false;
  let showWakeEnableModal = false;
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
    void wakeManager.setUserEnabled(wakeRequested);
  }
  $: if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as any).__lgqDebug = { socket, state };
  }
  onDestroy(() => {
    countdown?.destroy?.();
    stopWakeSubscription?.();
    void wakeManager?.destroy();
  });
  let socket: ReturnType<typeof createSocket> | null = null;
  let name = '';
  let emoji = '😀';
  let registerError = '';
  let registered = false;
  let inputAnswer = '';
  let joinError = '';
  let joinPassword = '';
  let joiningRoom = false;
  let needsRoomPassword = false;
  let showExitModal = false;
  let showSettingsModal = false;
  let leavingQuiz = false;
  let wasKickedFromRoom: 'kicked' | 'banned' | null = null;

  const EMOJI_OPTIONS = [
    '😀', '😎', '🤓', '😇', '🥳', '🤩', '😊', '🙂', '😏',
    '🎉', '🧠', '⭐', '🔥', '🚀', '🎯', '💡', '🏆', '🎮', '🎸',
    '🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🦉', '🐙',
    '🍕', '🍔', '☕', '🍩', '🌮', '🥑', '🍎', '🍋', '🌶️', '🍿',
    '😄', '😁', '😆', '😂', '🤣', '😍', '🥰', '😘', '😋', '🙌',
    '👏', '🤝', '💪', '🫶', '🎊', '🎈', '🎵', '🎤', '🎨', '📚',
    '🧩', '♟️', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏓',
    '🐵', '🐨', '🐮', '🐷', '🐰', '🐹', '🦄', '🐢', '🐬', '🐝',
    '🍉', '🍇', '🍓', '🍒', '🍍', '🥨', '🍪', '🍫', '🧋', '🧁',
  ];
  onMount(() => {
    wakeManager = createWakeManager();
    stopWakeSubscription = wakeManager.subscribe((next) => {
      wakeSnapshot = next;
    });

    const wasKickedVal =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('wasKicked_' + roomId)
        : null;
    if (wasKickedVal) {
      wasKickedFromRoom = wasKickedVal === 'banned' ? 'banned' : 'kicked';
    }

    const playerId = getOrCreatePlayerId();
    socket = createSocket();
    socket.on('player:kicked', (payload: { banned?: boolean }) => {
      const banned = !!payload?.banned;
      try {
        sessionStorage.setItem('wasKicked_' + roomId, banned ? 'banned' : 'kicked');
      } catch {
        /* ignore */
      }
      window.location.href = '/';
    });
    socket.on('state:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });
    socket.on('room:update', (payload: { state: SerializedState }) => {
      state = payload.state;
    });

    if (!wasKickedFromRoom) {
      joinRoom(playerId, joinPassword);
    }
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
      (ack: { ok?: boolean; state?: SerializedState; error?: string; code?: string; message?: string }) => {
        joiningRoom = false;
        if (ack?.ok === false && ack?.code === 'BANNED') {
          wasKickedFromRoom = 'banned';
          joinError = ack.message ?? 'You have been banned from this room';
          return;
        }
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
          if (ack.error === 'That player is already in the room') {
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
  let selectedMultiSelect: { questionId: string; answerIndexes: number[] } | null = null;
  let selectedReorder: { questionId: string; answerIndexes: number[] } | null = null;
  let selectedSlider: { questionId: string; answerNumber: number } | null = null;
  let selectedHotspot: { questionId: string; x: number; y: number } | null = null;
  let selectedInput: string | null = null;
  let multiSelectDraft: number[] = [];
  let reorderDraft: number[] = [];
  let sliderAnswer: number | null = null;

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
      selectedMultiSelect = null;
      selectedReorder = null;
      selectedSlider = null;
      selectedHotspot = null;
      selectedInput = null;
      multiSelectDraft = [];
      reorderDraft = [];
      sliderAnswer = null;
      inputAnswer = '';
    }
  }

  $: currentQuestion =
    state?.quiz?.rounds?.[state.currentRoundIndex]?.questions?.[state.currentQuestionIndex] ?? null;
  $: currentQuestionId = currentQuestion?.id ?? '';
  $: if (currentQuestion?.type === 'slider' && sliderAnswer === null) {
    sliderAnswer = currentQuestion.min;
  }
  $: questionTimeExpired = !!(
    state?.type === 'Question' &&
    state?.timerEndsAt &&
    countdown &&
    ($countdown ?? 0) === 0
  );
  $: hasAnsweredCurrentQuestion =
    hasSubmitted(currentQuestionId) ||
    selectedAnswer?.questionId === currentQuestionId ||
    selectedMultiSelect?.questionId === currentQuestionId ||
    selectedReorder?.questionId === currentQuestionId ||
    selectedSlider?.questionId === currentQuestionId ||
    selectedHotspot?.questionId === currentQuestionId ||
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
      ? { ...state, submissions: [...(state.submissions ?? []), { playerId, questionId, answerText }] }
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

  function submitMultiSelect(questionId: string, answerIndexes: number[]) {
    if (
      hasSubmitted(questionId) ||
      selectedMultiSelect?.questionId === questionId ||
      questionTimeExpired
    ) {
      return;
    }
    const normalized = [...new Set(answerIndexes)].sort((a, b) => a - b);
    if (normalized.length === 0) return;
    submitError = '';
    selectedMultiSelect = { questionId, answerIndexes: normalized };
    const playerId = getOrCreatePlayerId();
    state = state
      ? {
          ...state,
          submissions: [...(state.submissions ?? []), { playerId, questionId, answerIndexes: normalized }],
        }
      : state;
    socket?.emit('player:answer', { questionId, answerIndexes: normalized }, (ack: { error?: string }) => {
      if (ack?.error) {
        submitError = ack.error;
        selectedMultiSelect = null;
        state =
          state?.submissions != null
            ? {
                ...state,
                submissions: state.submissions.filter(
                  (s) => !(s.playerId === playerId && s.questionId === questionId)
                ),
              }
            : state;
      }
    });
  }

  function submitReorder(questionId: string, answerIndexes: number[]) {
    if (
      hasSubmitted(questionId) ||
      selectedReorder?.questionId === questionId ||
      questionTimeExpired
    ) {
      return;
    }
    submitError = '';
    selectedReorder = { questionId, answerIndexes: [...answerIndexes] };
    const playerId = getOrCreatePlayerId();
    state = state
      ? {
          ...state,
          submissions: [...(state.submissions ?? []), { playerId, questionId, answerIndexes: [...answerIndexes] }],
        }
      : state;
    socket?.emit('player:answer', { questionId, answerIndexes: [...answerIndexes] }, (ack: { error?: string }) => {
      if (ack?.error) {
        submitError = ack.error;
        selectedReorder = null;
        state =
          state?.submissions != null
            ? {
                ...state,
                submissions: state.submissions.filter(
                  (s) => !(s.playerId === playerId && s.questionId === questionId)
                ),
              }
            : state;
      }
    });
  }

  function submitSlider(questionId: string, answerNumber: number) {
    if (
      hasSubmitted(questionId) ||
      selectedSlider?.questionId === questionId ||
      questionTimeExpired
    ) {
      return;
    }
    submitError = '';
    selectedSlider = { questionId, answerNumber };
    const playerId = getOrCreatePlayerId();
    state = state
      ? {
          ...state,
          submissions: [...(state.submissions ?? []), { playerId, questionId, answerNumber }],
        }
      : state;
    socket?.emit('player:answer', { questionId, answerNumber }, (ack: { error?: string }) => {
      if (ack?.error) {
        submitError = ack.error;
        selectedSlider = null;
        state =
          state?.submissions != null
            ? {
                ...state,
                submissions: state.submissions.filter(
                  (s) => !(s.playerId === playerId && s.questionId === questionId)
                ),
              }
            : state;
      }
    });
  }

  function submitHotspot(questionId: string, x: number, y: number) {
    if (
      hasSubmitted(questionId) ||
      selectedHotspot?.questionId === questionId ||
      questionTimeExpired
    ) {
      return;
    }
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    submitError = '';
    selectedHotspot = { questionId, x: clampedX, y: clampedY };
    const playerId = getOrCreatePlayerId();
    state = state
      ? {
          ...state,
          submissions: [
            ...(state.submissions ?? []),
            { playerId, questionId, answerX: clampedX, answerY: clampedY },
          ],
        }
      : state;
    socket?.emit(
      'player:answer',
      { questionId, answerX: clampedX, answerY: clampedY },
      (ack: { error?: string }) => {
        if (ack?.error) {
          submitError = ack.error;
          selectedHotspot = null;
          state =
            state?.submissions != null
              ? {
                  ...state,
                  submissions: state.submissions.filter(
                    (s) => !(s.playerId === playerId && s.questionId === questionId)
                  ),
                }
              : state;
        }
      }
    );
  }

  function hasSubmitted(questionId: string): boolean {
    const playerId = getOrCreatePlayerId();
    return state?.submissions?.some(
      (s) => s.playerId === playerId && s.questionId === questionId
    ) ?? false;
  }

  function isInputSubmitted(questionId: string): boolean {
    return hasSubmitted(questionId) || selectedInput === questionId;
  }

  function getSubmittedAnswerIndex(questionId: string): number | undefined {
    const playerId = getOrCreatePlayerId();
    const sub = state?.submissions?.find(
      (s) => s.playerId === playerId && s.questionId === questionId
    );
    return sub?.answerIndex;
  }

  function getSubmittedAnswerIndexes(questionId: string): number[] {
    const playerId = getOrCreatePlayerId();
    const sub = state?.submissions?.find(
      (s) => s.playerId === playerId && s.questionId === questionId
    );
    return sub?.answerIndexes ?? [];
  }

  function getSubmittedAnswerNumber(questionId: string): number | undefined {
    const playerId = getOrCreatePlayerId();
    const sub = state?.submissions?.find(
      (s) => s.playerId === playerId && s.questionId === questionId
    );
    return sub?.answerNumber;
  }

  function getSubmittedHotspot(questionId: string): { x: number; y: number } | undefined {
    const playerId = getOrCreatePlayerId();
    const sub = state?.submissions?.find(
      (s) => s.playerId === playerId && s.questionId === questionId
    );
    if (sub?.answerX != null && sub?.answerY != null) return { x: sub.answerX, y: sub.answerY };
    if (selectedHotspot?.questionId === questionId) return { x: selectedHotspot.x, y: selectedHotspot.y };
    return undefined;
  }

  function getSubmittedAnswerText(questionId: string): string {
    const playerId = getOrCreatePlayerId();
    const sub = state?.submissions?.find(
      (s) => s.playerId === playerId && s.questionId === questionId
    );
    return sub?.answerText ?? '';
  }

  function getDisplayedInputAnswer(questionId: string): string {
    return getSubmittedAnswerText(questionId) || (selectedInput === questionId ? inputAnswer.trim() : '');
  }

  function getQuestionOptions(q: Question): string[] {
    if (q.type === 'true_false') return ['True', 'False'];
    if (q.type === 'choice' || q.type === 'poll' || q.type === 'multi_select' || q.type === 'reorder') return q.options;
    if (q.type === 'hotspot') return [];
    return [];
  }

  function getOptionCounts(questionId: string): Map<number, number> {
    const counts = new Map<number, number>();
    for (const submission of state?.submissions ?? []) {
      if (submission.questionId !== questionId) continue;
      if (submission.answerIndex != null) {
        counts.set(submission.answerIndex, (counts.get(submission.answerIndex) ?? 0) + 1);
      }
      if (submission.answerIndexes?.length) {
        for (const answerIndex of submission.answerIndexes) {
          counts.set(answerIndex, (counts.get(answerIndex) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  function getSelectedOptionLabel(q: Question): string {
    const index = getSubmittedAnswerIndex(q.id);
    if (index == null) return '';
    return getQuestionOptions(q)[index] ?? '';
  }

  function getSelectedOptionLabels(q: Question): string[] {
    if (q.type === 'reorder') {
      const indexes =
        getSubmittedAnswerIndexes(q.id).length > 0
          ? getSubmittedAnswerIndexes(q.id)
          : selectedReorder?.questionId === q.id
            ? selectedReorder.answerIndexes
            : reorderDraft;
      return indexes.map((index) => q.options[index]).filter(Boolean);
    }
    const indexes =
      getSubmittedAnswerIndexes(q.id).length > 0
        ? getSubmittedAnswerIndexes(q.id)
        : selectedMultiSelect?.questionId === q.id
          ? selectedMultiSelect.answerIndexes
          : multiSelectDraft;
    return indexes.map((index) => getQuestionOptions(q)[index]).filter(Boolean);
  }

  function isMultiSelectSubmitted(questionId: string): boolean {
    return hasSubmitted(questionId) || selectedMultiSelect?.questionId === questionId;
  }

  function isSliderSubmitted(questionId: string): boolean {
    return hasSubmitted(questionId) || selectedSlider?.questionId === questionId;
  }

  function isReorderSubmitted(questionId: string): boolean {
    return hasSubmitted(questionId) || selectedReorder?.questionId === questionId;
  }

  function isHotspotSubmitted(questionId: string): boolean {
    return hasSubmitted(questionId) || selectedHotspot?.questionId === questionId;
  }

  function toggleMultiSelectDraft(optionIndex: number) {
    multiSelectDraft = multiSelectDraft.includes(optionIndex)
      ? multiSelectDraft.filter((index) => index !== optionIndex)
      : [...multiSelectDraft, optionIndex].sort((a, b) => a - b);
  }

  $: if (currentQuestion?.type === 'reorder' && reorderDraft.length === 0) {
    reorderDraft = getShuffledReorderIndices(currentQuestion.id, currentQuestion.options.length);
  }

  $: playerId = getOrCreatePlayerId();
  $: currentPlayer = state?.players?.find((p) => p.id === playerId);
  $: unavailableEmojis = new Set(
    (state?.players ?? []).filter((p) => p.isActive).map((p) => p.emoji)
  );
  $: unavailableEmojisForSettings = new Set(
    (state?.players ?? []).filter((p) => p.isActive && p.id !== playerId).map((p) => p.emoji)
  );
  $: {
    if (!registered && unavailableEmojis.has(emoji)) {
      const firstAvailable = EMOJI_OPTIONS.find((e) => !unavailableEmojis.has(e));
      if (firstAvailable) emoji = firstAvailable;
    }
  }
  $: if (currentPlayer?.name && !registered) registered = true;
  $: myScore = currentPlayer?.score ?? 0;
  $: playerDisplayName = (currentPlayer?.name ?? name.trim()) || 'Anonymous';
  $: playerDisplayEmoji = currentPlayer?.emoji ?? emoji;
  $: optionLabelStyle = getOptionLabelStyle(state?.quiz?.meta);
  $: totalTimerSeconds = state?.quiz?.meta?.default_timer ?? 30;
  $: currentRoundQuestionTotal =
    state?.quiz?.rounds?.[state.currentRoundIndex]?.questions?.length ?? 0;
  $: currentQuestionNumber = (state?.currentQuestionIndex ?? 0) + 1;
  $: revealQuestion = state?.type === 'RevealAnswer' ? currentQuestion : null;
  $: canAttemptWakeNow = !!(registered && state && (state.type === 'Lobby' || isActiveQuizPhase));
  $: if (
    wakeManager &&
    canAttemptWakeNow &&
    !wakeRequested &&
    !wakeAutoAttempted &&
    !wakeAutoAttemptInFlight
  ) {
    void attemptWakeSilently();
  }
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

  async function attemptWakeSilently() {
    if (!wakeManager || wakeAutoAttempted || wakeAutoAttemptInFlight) return;
    wakeAutoAttemptInFlight = true;
    wakeRequested = true;
    try {
      await wakeManager.setAutoActive(false);
      await wakeManager.setUserEnabled(true);
      if (!wakeManager.getSnapshot().active) {
        showWakeEnableModal = true;
      }
    } finally {
      wakeAutoAttemptInFlight = false;
      wakeAutoAttempted = true;
    }
  }

  async function enableWakeFromTap() {
    showWakeEnableModal = false;
    wakeRequested = true;
    if (!wakeManager) return;
    await wakeManager.setAutoActive(false);
    await wakeManager.setUserEnabled(true);
    await wakeManager.sync();
    if (!wakeManager.getSnapshot().active) {
      showWakeEnableModal = true;
    }
  }

  function closeWakeEnableModal() {
    showWakeEnableModal = false;
  }

  function openSettingsModal() {
    if (registered && currentPlayer) {
      name = currentPlayer.name || '';
      emoji = currentPlayer.emoji || '😀';
    }
    registerError = '';
    showSettingsModal = true;
  }

  function exitQuiz() {
    if (leavingQuiz) return;
    leavingQuiz = true;
    if (socket?.connected) {
      socket.emit('player:leave', {}, () => {
        window.location.href = '/';
      });
    } else {
      window.location.href = '/';
    }
  }

  $: inLobby = state?.type === 'Lobby';
  $: settingsDisabled = !inLobby || !registered;

</script>

<div class="min-h-screen flex flex-col">
  {#if state}
    <PlayerNav
      inLobby={inLobby}
      settingsDisabled={settingsDisabled}
      onExitClick={() => (showExitModal = true)}
      onSettingsClick={openSettingsModal}
    />
  {/if}
  <div class="flex-1 p-6">
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
      {#if wakeAutoAttempted && !wakeSnapshot.active}
        <div class="mb-4 text-xs">
          <button
            type="button"
            class="px-3 py-1 rounded-md border border-pub-muted bg-pub-dark hover:opacity-90 w-full sm:w-auto"
            on:click={enableWakeFromTap}
          >
            Enable screen wake
          </button>
        </div>
      {/if}
    {/if}
    {#if !state}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">Join room {roomId}</h2>
        {#if wasKickedFromRoom}
          <p class="text-sm text-red-400 mb-2">
            {wasKickedFromRoom === 'banned'
              ? 'You have been banned from this room.'
              : 'You were removed from the room.'}
          </p>
          <button
            type="button"
            class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            disabled={joiningRoom}
            on:click={() => {
              try {
                sessionStorage.removeItem('wasKicked_' + roomId);
              } catch {
                /* ignore */
              }
              wasKickedFromRoom = null;
              joinRoom(getOrCreatePlayerId(), joinPassword);
            }}
          >
            {joiningRoom ? 'Joining...' : 'Try again'}
          </button>
        {:else if needsRoomPassword}
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
        {:else if joinError === 'That player is already in the room'}
          <p class="text-sm text-red-400 mb-2">{joinError}</p>
          <p class="text-pub-muted text-sm">Open this room in a different browser or incognito window to join as another player.</p>
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
              maxlength={50}
              class="w-full bg-pub-dark border rounded-lg px-4 py-2 {name.length >= 50 ? 'border-amber-500' : 'border-pub-muted'}"
            />
            <p class="mt-1 text-sm {name.length >= 50 ? 'text-amber-500' : 'text-pub-muted'}">
              {name.length}/50 characters
              {#if name.length >= 50}
                <span class="font-medium"> — at limit</span>
              {/if}
            </p>
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
            {@const hq = q as HotspotQuestion}
            {@const src = getQuestionImageSrc(hq.image, state.quizFilename)}
            {@const tap = getSubmittedHotspot(q.id)}
            {#if src}
              <div
                class="relative inline-block max-w-full cursor-crosshair my-4"
                role="button"
                tabindex="0"
                on:click={(e) => {
                  const img = e.currentTarget.querySelector('img');
                  if (!img || isHotspotSubmitted(q.id) || questionTimeExpired) return;
                  const rect = img.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  const y = (e.clientY - rect.top) / rect.height;
                  submitHotspot(q.id, x, y);
                }}
                on:touchend={(e) => {
                  const img = e.currentTarget.querySelector('img');
                  if (!img || isHotspotSubmitted(q.id) || questionTimeExpired) return;
                  const touch = e.changedTouches?.[0];
                  if (!touch) return;
                  const rect = img.getBoundingClientRect();
                  const x = (touch.clientX - rect.left) / rect.width;
                  const y = (touch.clientY - rect.top) / rect.height;
                  submitHotspot(q.id, x, y);
                }}
                on:keydown={(e) => e.key === 'Enter' && e.currentTarget.click()}
              >
                <img src={src} alt="" class="max-w-full rounded-lg block" />
                {#if tap}
                  <div
                    class="absolute w-3 h-3 rounded-full bg-pub-gold border-2 border-white pointer-events-none"
                    style="left: {(tap.x * 100)}%; top: {(tap.y * 100)}%; transform: translate(-50%, -50%);"
                  ></div>
                {/if}
              </div>
              <p class="text-sm text-pub-muted mb-2">Tap the correct area on the image</p>
            {/if}
          {:else if q.image}
            {@const src = getQuestionImageSrc(q.image, state.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if q.type === 'choice' || q.type === 'true_false' || q.type === 'poll'}
            {@const options = getQuestionOptions(q)}
            <div class="space-y-2">
              {#each options as opt, i}
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
          {:else if q.type === 'multi_select'}
            <div class="space-y-2">
              {#each q.options as opt, i}
                {@const isChosen = getSubmittedAnswerIndexes(q.id).includes(i) || (selectedMultiSelect?.questionId === q.id ? selectedMultiSelect.answerIndexes.includes(i) : multiSelectDraft.includes(i))}
                <button
                  class="w-full px-4 py-3 bg-pub-dark rounded-lg text-left hover:bg-pub-accent/20 disabled:opacity-50 flex items-center gap-2 {isChosen ? 'ring-2 ring-pub-gold' : ''} {questionTimeExpired ? 'opacity-60' : ''}"
                  disabled={isMultiSelectSubmitted(q.id) || questionTimeExpired}
                  on:click={() => toggleMultiSelectDraft(i)}
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
              <button
                type="button"
                class="mt-2 px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                disabled={isMultiSelectSubmitted(q.id) || multiSelectDraft.length === 0 || questionTimeExpired}
                on:click={() => submitMultiSelect(q.id, multiSelectDraft)}
              >
                Submit
              </button>
            </div>
          {:else if q.type === 'reorder'}
            <div class="space-y-2">
              <p class="text-sm text-pub-muted mb-4">Use arrows to reorder items</p>
              {#each reorderDraft as optIndex, currentPos}
                <div class="flex items-center gap-2 bg-pub-dark rounded-lg p-2 {questionTimeExpired || isReorderSubmitted(q.id) ? 'opacity-60' : ''}">
                  <span class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center leading-none">
                    {currentPos + 1}
                  </span>
                  <span class="flex-1 break-words px-2">{q.options[optIndex]}</span>
                  {#if !isReorderSubmitted(q.id) && !questionTimeExpired}
                    <div class="flex flex-col gap-1">
                      <button
                        type="button"
                        class="w-8 h-8 flex items-center justify-center bg-pub-darker rounded hover:bg-pub-accent/20 disabled:opacity-30 disabled:hover:bg-pub-darker"
                        disabled={currentPos === 0}
                        on:click={() => {
                          if (currentPos > 0) {
                            const newDraft = [...reorderDraft];
                            [newDraft[currentPos - 1], newDraft[currentPos]] = [newDraft[currentPos], newDraft[currentPos - 1]];
                            reorderDraft = newDraft;
                          }
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        class="w-8 h-8 flex items-center justify-center bg-pub-darker rounded hover:bg-pub-accent/20 disabled:opacity-30 disabled:hover:bg-pub-darker"
                        disabled={currentPos === reorderDraft.length - 1}
                        on:click={() => {
                          if (currentPos < reorderDraft.length - 1) {
                            const newDraft = [...reorderDraft];
                            [newDraft[currentPos + 1], newDraft[currentPos]] = [newDraft[currentPos], newDraft[currentPos + 1]];
                            reorderDraft = newDraft;
                          }
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
              <button
                type="button"
                class="mt-4 px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                disabled={isReorderSubmitted(q.id) || questionTimeExpired}
                on:click={() => submitReorder(q.id, reorderDraft)}
              >
                Submit Ordering
              </button>
            </div>
          {:else if q.type === 'slider'}
            <div class="space-y-4">
              <div class="px-4 py-4 bg-pub-dark rounded-lg {isSliderSubmitted(q.id) ? 'opacity-60' : ''}">
                <div class="flex items-center justify-between gap-4 mb-3">
                  <span class="text-sm text-pub-muted">{q.min}</span>
                  <span class="text-lg font-semibold text-pub-gold">{sliderAnswer ?? q.min}</span>
                  <span class="text-sm text-pub-muted">{q.max}</span>
                </div>
                <input
                  type="range"
                  min={q.min}
                  max={q.max}
                  step={q.step}
                  bind:value={sliderAnswer}
                  class="w-full"
                  disabled={isSliderSubmitted(q.id) || questionTimeExpired}
                />
              </div>
              <button
                type="button"
                class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                disabled={isSliderSubmitted(q.id) || sliderAnswer == null || questionTimeExpired}
                on:click={() => submitSlider(q.id, Number(sliderAnswer))}
              >
                Submit
              </button>
            </div>
          {:else if q.type === 'input' || q.type === 'open_ended' || q.type === 'word_cloud'}
            {@const maxChars = q.type === 'word_cloud' ? 75 : q.type === 'input' ? 75 : 200}
            {@const atLimit = inputAnswer.length >= maxChars}
            <form
              class="flex flex-col gap-2"
              on:submit|preventDefault={() => {
                if (inputAnswer.trim() && !isInputSubmitted(q.id) && !questionTimeExpired) {
                  submitInput(q.id, inputAnswer.trim());
                }
              }}
            >
              <div class="flex gap-2">
                <input
                  type="text"
                  bind:value={inputAnswer}
                  placeholder="Your answer"
                  maxlength={maxChars}
                  class="flex-1 bg-pub-dark border rounded-lg px-4 py-2 {atLimit ? 'border-amber-500' : 'border-pub-muted'} {isInputSubmitted(q.id) ? 'opacity-60' : ''}"
                  disabled={isInputSubmitted(q.id) || questionTimeExpired}
                  on:keydown={(e) => {
                    if (e.key === 'Enter') {
                      if (inputAnswer.trim() && !isInputSubmitted(q.id) && !questionTimeExpired) {
                        submitInput(q.id, inputAnswer.trim());
                      }
                    }
                  }}
                />
                <button
                  type="submit"
                  class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                  disabled={isInputSubmitted(q.id) || !inputAnswer.trim() || questionTimeExpired}
                >
                  Submit
                </button>
              </div>
              <p class="text-sm {atLimit ? 'text-amber-500' : 'text-pub-muted'}">
                {inputAnswer.length}/{maxChars} characters
                {#if atLimit}
                  <span class="font-medium"> — at limit</span>
                {/if}
              </p>
            </form>
          {/if}
          {#if currentRoundQuestionTotal > 0}
            <p class="mt-4 text-center text-sm font-medium text-pub-muted">
              {currentQuestionNumber}/{currentRoundQuestionTotal}
            </p>
          {/if}
        {/if}
        {#if hasAnsweredCurrentQuestion && currentQuestion?.type !== 'input' && currentQuestion?.type !== 'open_ended' && currentQuestion?.type !== 'word_cloud'}
          <p class="mt-4 text-pub-gold">Answer submitted!</p>
          {#if currentQuestion?.type === 'hotspot' && getSubmittedHotspot(currentQuestion.id)}
            <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
              You tapped at ({Math.round(getSubmittedHotspot(currentQuestion.id)!.x * 100)}%, {Math.round(getSubmittedHotspot(currentQuestion.id)!.y * 100)}%)
            </p>
          {:else if (currentQuestion?.type === 'true_false' || currentQuestion?.type === 'poll') && getSelectedOptionLabel(currentQuestion)}
            <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
              You selected: {getSelectedOptionLabel(currentQuestion)}
            </p>
          {:else if currentQuestion?.type === 'multi_select' && getSelectedOptionLabels(currentQuestion).length > 0}
            <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
              You selected: {getSelectedOptionLabels(currentQuestion).join(', ')}
            </p>
          {:else if currentQuestion?.type === 'reorder'}
            <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
              Your order: {getSelectedOptionLabels(currentQuestion).join(', ')}
            </p>
          {:else if currentQuestion?.type === 'slider' && getSubmittedAnswerNumber(currentQuestion.id) != null}
            <p class="mt-2 px-4 py-3 bg-pub-dark rounded text-pub-muted break-words">
              You selected: {getSubmittedAnswerNumber(currentQuestion.id)}
            </p>
          {/if}
        {:else if showTimesUpMessage}
          <p class="mt-4 text-red-400">Time's Up!</p>
        {:else if submitError}
          <p class="mt-4 text-red-500">{submitError}</p>
        {/if}
      </div>
    {:else if state?.type === 'RevealAnswer'}
      <div class="bg-pub-darker rounded-lg p-6">
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
          <p class="text-xl mb-4">{q.text}</p>
          {#if q.type === 'hotspot'}
            {@const hq = q as HotspotQuestion}
            {@const src = getQuestionImageSrc(hq.image, state.quizFilename)}
            {@const ar = hq.imageAspectRatio ?? 1}
            {@const rY = hq.answer.radiusY ?? hq.answer.radius}
            {@const rot = hq.answer.rotation ?? 0}
            {@const tap = getSubmittedHotspot(q.id)}
            {#if src}
              <div class="relative inline-block max-w-full my-4">
                <img src={src} alt="" class="max-w-full rounded-lg block" />
                <div
                  class="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none rounded-full origin-center"
                  style="left: {((hq.answer.x - hq.answer.radius / ar) * 100)}%; top: {((hq.answer.y - rY) * 100)}%; width: {(hq.answer.radius * 2 / ar) * 100}%; height: {(rY * 2) * 100}%; transform: rotate({rot}deg);"
                ></div>
                {#if tap}
                  <div
                    class="absolute w-3 h-3 rounded-full bg-pub-gold border-2 border-white pointer-events-none"
                    style="left: {(tap.x * 100)}%; top: {(tap.y * 100)}%; transform: translate(-50%, -50%);"
                  ></div>
                {/if}
              </div>
            {/if}
          {:else if q.image}
            {@const src = getQuestionImageSrc(q.image, state.quizFilename)}
            {#if src}
              <img src={src} alt="" class="max-w-full rounded-lg my-4" />
            {/if}
          {/if}
          {#if q.type === 'choice' || q.type === 'true_false'}
            {@const options = getQuestionOptions(q)}
            <ul class="space-y-2">
              {#each options as opt, i}
                {@const isChosen = (hasSubmitted(q.id) && getSubmittedAnswerIndex(q.id) === i) || (selectedAnswer?.questionId === q.id && selectedAnswer?.answerIndex === i)}
                <li class="px-4 py-2 bg-pub-dark rounded {(q.type === 'choice' ? q.answer : (q.answer ? 0 : 1)) === i ? 'ring-2 ring-green-500' : `opacity-60 ${isChosen ? 'ring-2 ring-pub-gold' : ''}`}">
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
                      {opt} {#if (q.type === 'choice' ? q.answer : (q.answer ? 0 : 1)) === i}(correct){/if}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'multi_select'}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                {@const isCorrect = q.answer.includes(i)}
                {@const isChosen = getSubmittedAnswerIndexes(q.id).includes(i) || (selectedMultiSelect?.questionId === q.id && selectedMultiSelect.answerIndexes.includes(i))}
                <li class="px-4 py-2 bg-pub-dark rounded {isCorrect ? 'ring-2 ring-green-500' : `opacity-60 ${isChosen ? 'ring-2 ring-pub-gold' : ''}`}">
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
                      {opt} {#if isCorrect}(correct){/if}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if q.type === 'reorder'}
            <div class="space-y-4">
              <div>
                <h3 class="text-sm font-semibold text-pub-muted mb-2">Correct Order:</h3>
                <ul class="space-y-2">
                  {#each q.answer as optIndex, i}
                    <li class="px-4 py-2 bg-pub-dark rounded ring-2 ring-green-500">
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
              {#if isReorderSubmitted(q.id)}
                <div>
                  <h3 class="text-sm font-semibold text-pub-muted mb-2">Your Order:</h3>
                  <ul class="space-y-2 opacity-60">
                    {#each getSubmittedAnswerIndexes(q.id) as optIndex, i}
                      <li class="px-4 py-2 bg-pub-dark rounded {q.answer[i] === optIndex ? 'ring-1 ring-green-500/50' : 'ring-1 ring-red-500/50'}">
                        <div class="flex items-center gap-2">
                          <span class="w-7 h-7 rounded-full bg-pub-muted text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none">
                            {i + 1}
                          </span>
                          <span class="flex-1 break-words">{q.options[optIndex]}</span>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {:else if q.type === 'poll'}
            {@const counts = getOptionCounts(q.id)}
            <ul class="space-y-2">
              {#each q.options as opt, i}
                {@const isChosen = (hasSubmitted(q.id) && getSubmittedAnswerIndex(q.id) === i) || (selectedAnswer?.questionId === q.id && selectedAnswer?.answerIndex === i)}
                <li class="px-4 py-2 bg-pub-dark rounded {isChosen ? 'ring-2 ring-pub-gold' : 'opacity-60'}">
                  <div class="flex items-center gap-2">
                    <span class="w-4 text-pub-gold" aria-hidden="true">
                      {#if isChosen}
                        ●
                      {/if}
                    </span>
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
              <p class="px-4 py-2 bg-pub-dark rounded ring-2 ring-green-500 text-pub-gold">
                Correct: {q.answer}
              </p>
              {#if getSubmittedAnswerNumber(q.id) != null}
                <p class="px-4 py-2 bg-pub-dark rounded text-pub-muted">
                  You selected: {getSubmittedAnswerNumber(q.id)}
                </p>
              {/if}
            </div>
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
</div>

{#if showExitModal}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="exit-modal-title">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 id="exit-modal-title" class="text-lg font-semibold text-pub-gold mb-3">Exit quiz?</h2>
      {#if inLobby}
        <p class="text-sm text-pub-muted mb-5">
          You will leave the room. You can rejoin anytime before the host starts the quiz. No score or progress will be affected.
        </p>
      {:else}
        <p class="text-sm text-pub-muted mb-5">
          You will be removed from the quiz and cannot rejoin this session. Your score will not count and you will not appear on the leaderboard.
        </p>
      {/if}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          on:click={() => (showExitModal = false)}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 bg-red-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          on:click={exitQuiz}
          disabled={leavingQuiz}
        >
          {leavingQuiz ? 'Leaving...' : 'Exit quiz'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showSettingsModal}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5 max-h-[90vh] overflow-y-auto">
      <h2 id="settings-modal-title" class="text-lg font-semibold text-pub-gold mb-4">Change name and emoji</h2>
      <form class="space-y-4" on:submit|preventDefault={() => { register(); showSettingsModal = false; }}>
        <div>
          <label for="settings-name" class="block text-sm text-pub-muted mb-1">Your name</label>
          <input
            id="settings-name"
            type="text"
            bind:value={name}
            placeholder="Enter your name"
            maxlength={50}
            class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
          />
          <p class="mt-1 text-sm text-pub-muted">{name.length}/50 characters</p>
        </div>
        <div>
          <span class="block text-sm text-pub-muted mb-2">Pick an emoji</span>
          <div class="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-44 overflow-y-auto p-1" style="scrollbar-width: thin;">
            {#each EMOJI_OPTIONS as e}
              {@const isUnavailable = unavailableEmojisForSettings.has(e)}
              <button
                type="button"
                class="relative h-12 w-full text-2xl leading-none rounded flex items-center justify-center {isUnavailable ? 'bg-pub-dark opacity-45 cursor-not-allowed' : emoji === e ? 'bg-pub-accent ring-2 ring-pub-gold' : 'bg-pub-dark hover:bg-pub-darker'}"
                disabled={isUnavailable}
                on:click={() => { if (!isUnavailable) emoji = e; }}
              >
                {e}
                {#if isUnavailable}
                  <span class="absolute inset-0 flex items-center justify-center text-base font-extrabold text-red-300 pointer-events-none">✕</span>
                {/if}
              </button>
            {/each}
          </div>
          {#if registerError}
            <p class="mt-2 text-sm text-red-400">{registerError}</p>
          {/if}
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
            on:click={() => { showSettingsModal = false; registerError = ''; }}
          >
            Cancel
          </button>
          <button type="submit" class="px-4 py-2 bg-green-600 rounded-lg font-medium hover:opacity-90">
            Save
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showWakeEnableModal}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 class="text-lg font-semibold text-pub-gold mb-3">Keep your screen awake?</h2>
      <p class="text-sm text-pub-muted mb-5">
        We could not enable screen wake automatically. Tap below to keep your screen on during the
        quiz.
      </p>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          on:click={closeWakeEnableModal}
        >
          Not now
        </button>
        <button
          type="button"
          class="px-4 py-2 bg-green-600 rounded-lg font-medium hover:opacity-90"
          on:click={enableWakeFromTap}
        >
          Enable
        </button>
      </div>
    </div>
  </div>
{/if}
