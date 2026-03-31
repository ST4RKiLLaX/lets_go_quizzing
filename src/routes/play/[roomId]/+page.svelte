<script lang="ts">
  import { page } from '$app/stores';
  import PlayerConfetti from '$lib/components/PlayerConfetti.svelte';
  import PlayerJoinForm from '$lib/components/player/PlayerJoinForm.svelte';
  import PlayerLobbyForm from '$lib/components/player/PlayerLobbyForm.svelte';
  import PlayerQuestionForm from '$lib/components/player/PlayerQuestionForm.svelte';
  import PlayerRevealView, { type RevealData } from '$lib/components/player/PlayerRevealView.svelte';
  import SessionLeaderboardView from '$lib/components/shared/SessionLeaderboardView.svelte';
  import PlayerExitModal from '$lib/components/player/PlayerExitModal.svelte';
  import PlayerNav from '$lib/components/PlayerNav.svelte';
  import PlayerSettingsModal from '$lib/components/player/PlayerSettingsModal.svelte';
  import PlayerWakeModal from '$lib/components/player/PlayerWakeModal.svelte';
  import { createSocket, getOrCreatePlayerId } from '$lib/socket.js';
  import type { SerializedRoomPatch, SerializedState } from '$lib/types/game.js';
  import type { ClaimedPrize, PrizeOption } from '$lib/types/prizes.js';
  import type { Question } from '$lib/types/quiz.js';
  import { createWakeManager, type WakeSnapshot } from '$lib/utils/wake-manager.js';
  import { getQuestionOptions, getOptionCounts } from '$lib/player/question-helpers.js';
  import { getQuestionDisplayOptionIndices } from '$lib/utils/shuffle.js';
  import { getOptionLabelStyle } from '$lib/utils/option-label.js';
  import { useCountdown } from '$lib/timer.js';
  import { sortPlayersByScore } from '$lib/utils/players.js';
  import { applyRoomPatch } from '$lib/utils/realtime-patches.js';
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
  const confettiDurationMs = 1200;
  let showConfetti = false;
  let confettiRunId = 0;
  let previousStateType: SerializedState['type'] | null = null;
  const celebratedRevealKeys = new Set<string>();
  let clockOffsetMs = 0;

  function syncClockOffset(nextState: SerializedState | null | undefined) {
    if (nextState?.serverNow != null) {
      clockOffsetMs = nextState.serverNow - Date.now();
    }
  }

  $: timerEndsAt =
    state?.type === 'Question' || state?.type === 'RevealAnswer' ? state.timerEndsAt : undefined;
  $: isActiveQuizPhase = state?.type === 'Question' || state?.type === 'RevealAnswer';
  $: {
    countdown?.destroy?.();
    countdown = useCountdown(timerEndsAt, clockOffsetMs);
  }
  $: if (wakeManager) {
    void wakeManager.setAutoActive(false);
    void wakeManager.setUserEnabled(wakeRequested);
  }
  $: if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as Window & { __lgqDebug?: unknown }).__lgqDebug = { socket, state };
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
  let needsRequestForm = false;
  let waitingForApproval = false;
  let deniedByHost = false;
  let requestFormUnavailableEmojis = new Set<string>();
  let showExitModal = false;
  let showSettingsModal = false;
  let settingsDraftName = '';
  let settingsDraftEmoji = '😀';
  let leavingQuiz = false;
  let wasKickedFromRoom: 'kicked' | 'banned' | null = null;
  let prizeFeatureEnabled = false;
  let prizeEmailAvailableNow = false;
  let prizeEligibilityCheckedKey = '';
  let prizeEligible = false;
  let prizeOptions: PrizeOption[] = [];
  let prizeStatusMessage = '';
  let prizeEligibilityLoading = false;
  let prizeClaiming = false;
  let prizeClaimError = '';
  let claimedPrizes: ClaimedPrize[] = [];
  let claimedClaimId = '';
  let prizeEmail = '';
  let prizeEmailSending = false;
  let prizeEmailMessage = '';
  let prizeEmailMessageStatus: 'idle' | 'success' | 'error' = 'idle';
  let prizeAutoClaimedKey = '';

  import { EMOJI_OPTIONS } from '$lib/player/emoji-options.js';

  $: joinMode =
    (wasKickedFromRoom
      ? 'kicked'
      : needsRequestForm
        ? 'request'
        : waitingForApproval
          ? 'waiting'
          : deniedByHost
            ? 'denied'
            : needsRoomPassword
              ? 'password'
              : joinError
                ? 'error'
                : 'joining') as 'joining' | 'password' | 'request' | 'waiting' | 'denied' | 'kicked' | 'error';
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
    socket.on('player:admitted', (payload: { state?: SerializedState }) => {
      if (payload?.state) {
        syncClockOffset(payload.state);
        state = payload.state;
        registered = true;
        waitingForApproval = false;
      }
    });
    socket.on('player:denied', (payload: { usedEmojis?: string[]; message?: string } = {}) => {
      deniedByHost = true;
      waitingForApproval = false;
      requestFormUnavailableEmojis = new Set(payload?.usedEmojis ?? []);
      if (payload?.message) joinError = payload.message;
    });
    socket.on('state:update', (payload: { state: SerializedState }) => {
      syncClockOffset(payload.state);
      state = payload.state;
    });
    socket.on('room:patch', (payload: { patch?: SerializedRoomPatch }) => {
      if (!payload?.patch) return;
      state = applyRoomPatch(state, payload.patch);
    });

    if (!wasKickedFromRoom) {
      joinRoom(playerId, joinPassword);
    }
  });

  function register(onSuccess?: () => void, useSettingsEmojiCheck = false) {
    registerError = '';
    const unavailable = useSettingsEmojiCheck ? unavailableEmojisForSettings : unavailableEmojis;
    if (unavailable.has(emoji)) {
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
        if (ack?.ok) {
          registered = true;
          onSuccess?.();
        }
      }
    );
  }

  function joinRoom(playerId: string, password: string, requestName?: string, requestEmoji?: string) {
    if (!socket) return;
    joiningRoom = true;
    needsRequestForm = false;
    deniedByHost = false;
    socket.emit(
      'player:join',
      {
        roomId,
        playerId,
        password: password.trim() || undefined,
        name: requestName?.trim() || undefined,
        emoji: requestEmoji?.trim() || undefined,
      },
      (ack: { ok?: boolean; state?: SerializedState; error?: string; code?: string; message?: string; status?: string }) => {
        joiningRoom = false;
        if (ack?.ok === false && ack?.code === 'BANNED') {
          wasKickedFromRoom = 'banned';
          joinError = ack.message ?? 'You have been banned from this room';
          return;
        }
        if (ack?.ok === false && ack?.code === 'LATE_JOIN_DISABLED') {
          joinError = ack.message ?? 'This game has started. Late join is disabled.';
          return;
        }
        if (ack?.ok === false && ack?.code === 'REQUEST_REQUIRED') {
          needsRequestForm = true;
          needsRoomPassword = false;
          joinError = '';
          requestFormUnavailableEmojis = new Set((ack as { usedEmojis?: string[] }).usedEmojis ?? []);
          return;
        }
        if (ack?.ok === true && ack?.status === 'pending') {
          waitingForApproval = true;
          needsRequestForm = false;
          joinError = '';
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
          if (ack.error === 'Emoji unavailable') {
            joinError = 'That emoji was just taken. Please pick another.';
            needsRequestForm = true;
            deniedByHost = false;
            requestFormUnavailableEmojis = new Set((ack as { usedEmojis?: string[] }).usedEmojis ?? []);
            return;
          }
          if (ack.error === 'This name contains inappropriate content') {
            joinError = ack.error;
            needsRequestForm = true;
            deniedByHost = false;
            return;
          }
          if (ack?.code === 'ALREADY_WAITING') {
            joinError = ack.message ?? 'You are already waiting for approval';
            return;
          }
          window.location.href = '/';
          return;
        }
        needsRoomPassword = false;
        needsRequestForm = false;
        joinError = '';
        if (ack?.state) {
          syncClockOffset(ack.state);
          state = ack.state;
        }
      }
    );
  }

  let submitError = '';
  let selectedAnswer: { questionId: string; answerIndex: number } | null = null;
  let selectedMultiSelect: { questionId: string; answerIndexes: number[] } | null = null;
  let selectedReorder: { questionId: string; answerIndexes: number[] } | null = null;
  let selectedMatching: { questionId: string; answerIndexes: number[] } | null = null;
  let selectedSlider: { questionId: string; answerNumber: number } | null = null;
  let hotspotDraftByQuestionId: Record<string, { x: number; y: number }> = {};
  let matchingDraft: number[] = [];
  let autoSubmitAttemptsByQuestionId: Record<string, true> = {};
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
      // eslint-disable-next-line no-useless-assignment -- state for next reactive run
      prevQuestionKey = key;
      selectedAnswer = null;
      selectedMultiSelect = null;
      selectedReorder = null;
      selectedMatching = null;
      selectedSlider = null;
      hotspotDraftByQuestionId = {};
      matchingDraft = [];
      autoSubmitAttemptsByQuestionId = {};
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
  $: if (
    questionTimeExpired &&
    currentQuestion?.type === 'hotspot' &&
    !hasSubmitted(currentQuestionId)
  ) {
    const draft = hotspotDraftByQuestionId[currentQuestionId];
    if (draft && !autoSubmitAttemptsByQuestionId[currentQuestionId]) {
      // eslint-disable-next-line no-useless-assignment -- guard update for Svelte reactivity
      autoSubmitAttemptsByQuestionId = { ...autoSubmitAttemptsByQuestionId, [currentQuestionId]: true };
      submitHotspot(currentQuestionId, draft.x, draft.y);
    }
  }
  $: if (
    questionTimeExpired &&
    currentQuestion?.type === 'slider' &&
    !hasSubmitted(currentQuestionId) &&
    sliderAnswer != null &&
    !autoSubmitAttemptsByQuestionId[currentQuestionId]
  ) {
    // eslint-disable-next-line no-useless-assignment -- guard update for Svelte reactivity
    autoSubmitAttemptsByQuestionId = { ...autoSubmitAttemptsByQuestionId, [currentQuestionId]: true };
    submitSlider(currentQuestionId, Number(sliderAnswer));
  }
  $: hasAnsweredCurrentQuestion =
    hasSubmitted(currentQuestionId) ||
    selectedAnswer?.questionId === currentQuestionId ||
    selectedMultiSelect?.questionId === currentQuestionId ||
    selectedReorder?.questionId === currentQuestionId ||
    selectedMatching?.questionId === currentQuestionId ||
    selectedSlider?.questionId === currentQuestionId ||
    (currentQuestion?.type === 'hotspot' && hasSubmitted(currentQuestionId)) ||
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

  function submitMatching(questionId: string, answerIndexes: number[]) {
    if (
      hasSubmitted(questionId) ||
      selectedMatching?.questionId === questionId ||
      questionTimeExpired
    ) {
      return;
    }
    submitError = '';
    selectedMatching = { questionId, answerIndexes: [...answerIndexes] };
    const playerId = getOrCreatePlayerId();
    state = state
      ? {
          ...state,
          submissions: [
            ...(state.submissions ?? []),
            { playerId, questionId, answerIndexes: [...answerIndexes] },
          ],
        }
      : state;
    socket?.emit('player:answer', { questionId, answerIndexes: [...answerIndexes] }, (ack: { error?: string }) => {
      if (ack?.error) {
        submitError = ack.error;
        selectedMatching = null;
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
    if (hasSubmitted(questionId)) return;
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    submitError = '';
    hotspotDraftByQuestionId = { ...hotspotDraftByQuestionId };
    delete hotspotDraftByQuestionId[questionId];
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
          hotspotDraftByQuestionId = { ...hotspotDraftByQuestionId, [questionId]: { x: clampedX, y: clampedY } };
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

  function updateHotspotDraft(questionId: string, x: number, y: number) {
    if (hasSubmitted(questionId) || questionTimeExpired) return;
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    hotspotDraftByQuestionId = { ...hotspotDraftByQuestionId, [questionId]: { x: clampedX, y: clampedY } };
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
    return undefined;
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
    if (q.type === 'click_to_match' || q.type === 'drag_and_drop') {
      const indexes =
        getSubmittedAnswerIndexes(q.id).length > 0
          ? getSubmittedAnswerIndexes(q.id)
          : selectedMatching?.questionId === q.id
            ? selectedMatching.answerIndexes
            : q.id === currentQuestionId
              ? matchingDraft
              : [];
      return q.items
        .map((item, i) => {
          const idx = indexes[i];
          if (idx == null || idx < 0 || idx >= q.options.length) return '';
          return `${item} → ${q.options[idx]}`;
        })
        .filter(Boolean);
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

  function isMatchingSubmitted(questionId: string): boolean {
    return hasSubmitted(questionId) || selectedMatching?.questionId === questionId;
  }

  function isHotspotSubmitted(questionId: string): boolean {
    return hasSubmitted(questionId);
  }

  function toggleMultiSelectDraft(optionIndex: number) {
    multiSelectDraft = multiSelectDraft.includes(optionIndex)
      ? multiSelectDraft.filter((index) => index !== optionIndex)
      : [...multiSelectDraft, optionIndex].sort((a, b) => a - b);
  }

  $: if (currentQuestion?.type === 'reorder' && reorderDraft.length === 0) {
    reorderDraft = getQuestionDisplayOptionIndices(currentQuestion, roomId ?? undefined);
  }

  $: if (
    (currentQuestion?.type === 'click_to_match' || currentQuestion?.type === 'drag_and_drop') &&
    matchingDraft.length === 0
  ) {
    matchingDraft = currentQuestion.items.map(() => -1);
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
  $: revealData = ((): RevealData => {
    const q = state?.type === 'RevealAnswer' ? currentQuestion : null;
    if (!q) return {};
    const qId = q.id;
    const sub = state?.submissions?.find(
      (s) => s.playerId === getOrCreatePlayerId() && s.questionId === qId
    );
    const base: RevealData = {};
    if (q.type === 'hotspot') {
      if (sub?.answerX != null && sub?.answerY != null) {
        base.submittedHotspot = { x: sub.answerX, y: sub.answerY };
      } else if (hotspotDraftByQuestionId[qId]) {
        const d = hotspotDraftByQuestionId[qId];
        base.submittedHotspot = { x: d.x, y: d.y };
      }
    } else if (q.type === 'choice' || q.type === 'true_false' || q.type === 'poll') {
      const idx = sub?.answerIndex ?? (selectedAnswer?.questionId === qId ? selectedAnswer.answerIndex : undefined);
      if (idx != null) base.submittedAnswerIndex = idx;
    } else if (
      q.type === 'multi_select' ||
      q.type === 'reorder' ||
      q.type === 'click_to_match' ||
      q.type === 'drag_and_drop'
    ) {
      const idxs =
        (sub?.answerIndexes?.length ? sub.answerIndexes : undefined) ??
        (selectedMultiSelect?.questionId === qId ? selectedMultiSelect.answerIndexes : undefined) ??
        (selectedReorder?.questionId === qId ? selectedReorder.answerIndexes : undefined) ??
        (selectedMatching?.questionId === qId ? selectedMatching.answerIndexes : undefined) ??
        (q.type === 'reorder' && reorderDraft.length > 0 ? reorderDraft : undefined) ??
        ((q.type === 'click_to_match' || q.type === 'drag_and_drop') &&
        qId === currentQuestionId &&
        matchingDraft.every((v) => v >= 0)
          ? matchingDraft
          : undefined);
      if (idxs?.length) base.submittedAnswerIndexes = [...idxs];
    } else if (q.type === 'slider') {
      const num = sub?.answerNumber ?? (selectedSlider?.questionId === qId ? selectedSlider.answerNumber : undefined);
      if (num != null) base.submittedAnswerNumber = num;
    } else if (q.type === 'input' || q.type === 'open_ended' || q.type === 'word_cloud') {
      if (sub?.answerText != null) base.submittedAnswerText = sub.answerText;
    }
    if (q.type === 'poll') {
      const counts = getOptionCounts(state?.submissions ?? [], qId);
      base.optionCounts = Object.fromEntries(counts);
    }
    const markedWrong =
      state?.wrongAnswers?.some(
        (w) => w.playerId === getOrCreatePlayerId() && w.questionId === qId
      ) ?? false;
    base.wasCorrect = sub != null && !markedWrong;
    return base;
  })();
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
    // eslint-disable-next-line no-useless-assignment -- state for next reactive run
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
      settingsDraftName = currentPlayer.name || '';
      settingsDraftEmoji = currentPlayer.emoji || '😀';
    } else {
      settingsDraftName = name;
      settingsDraftEmoji = emoji;
    }
    registerError = '';
    showSettingsModal = true;
  }

  function saveSettingsFromModal() {
    name = settingsDraftName;
    emoji = settingsDraftEmoji;
    registerError = '';
    register(
      () => {
        showSettingsModal = false;
      },
      true
    );
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
  $: prizeEligibilityKey = state?.type === 'End' && currentPlayer ? `${state.roomId}:${currentPlayer.id}:${currentPlayer.score}` : '';
  $: if (state?.type !== 'End') {
    prizeEligibilityCheckedKey = '';
    prizeEligible = false;
    prizeOptions = [];
    prizeStatusMessage = '';
    prizeClaimError = '';
    claimedPrizes = [];
    claimedClaimId = '';
    prizeEmail = '';
    prizeEmailMessage = '';
    prizeAutoClaimedKey = '';
  }
  $: if (prizeEligibilityKey && prizeEligibilityKey !== prizeEligibilityCheckedKey && claimedPrizes.length === 0) {
    void loadPrizeEligibility();
  }
  $: if (
    prizeEligibilityKey &&
    prizeEligibilityCheckedKey === prizeEligibilityKey &&
    prizeEligible &&
    prizeOptions.length > 0 &&
    claimedPrizes.length === 0 &&
    prizeAutoClaimedKey !== prizeEligibilityKey &&
    !prizeClaiming
  ) {
    prizeAutoClaimedKey = prizeEligibilityKey;
    void claimPrize();
  }

  async function loadPrizeEligibility() {
    if (!state || state.type !== 'End' || !currentPlayer || !state.prizeClaimToken) return;
    prizeEligibilityLoading = true;
    prizeClaimError = '';
    try {
      const res = await fetch(
        `/api/prizes/eligibility?roomId=${encodeURIComponent(state.roomId)}&playerId=${encodeURIComponent(currentPlayer.id)}&token=${encodeURIComponent(state.prizeClaimToken)}`
      );
      const data = await res.json();
      prizeFeatureEnabled = data.enabled === true;
      prizeEmailAvailableNow = data.emailAvailableNow === true;
      prizeEligibilityCheckedKey = prizeEligibilityKey;
      prizeEligible = data.eligible === true;
      prizeOptions = Array.isArray(data.prizes) ? data.prizes : [];
      if (data.reason === 'already_claimed' && data.claim) {
        claimedPrizes = Array.isArray(data.claim.prizes) ? data.claim.prizes : [];
        claimedClaimId = data.claim.claimId ?? '';
      }
      prizeStatusMessage =
        data.reason === 'already_claimed'
          ? ''
          : data.reason === 'not_eligible'
            ? 'No prizes unlocked for this score.'
            : data.reason === 'not_ready'
              ? 'Prize claims are available when the game ends.'
              : '';
    } catch {
      prizeStatusMessage = 'Unable to check prize eligibility.';
    } finally {
      prizeEligibilityLoading = false;
    }
  }

  async function claimPrize() {
    if (!state || state.type !== 'End' || !state.prizeClaimToken) return;
    prizeClaiming = true;
    prizeClaimError = '';
    prizeEmailMessage = '';
    prizeEmailMessageStatus = 'idle';
    try {
      const res = await fetch('/api/prizes/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: state.roomId, playerId, token: state.prizeClaimToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        prizeClaimError = data.error ?? 'Prize claim failed';
        prizeAutoClaimedKey = '';
        return;
      }
      claimedPrizes = Array.isArray(data.prizes) ? data.prizes : [];
      claimedClaimId = data.claimId ?? '';
      prizeEmailAvailableNow = data.emailAvailableNow === true;
      prizeEligible = false;
      prizeOptions = [];
      prizeStatusMessage = '';
    } catch {
      prizeClaimError = 'Prize claim failed';
      prizeAutoClaimedKey = '';
    } finally {
      prizeClaiming = false;
    }
  }

  async function sendPrizeEmailNow() {
    if (!claimedClaimId || !prizeEmail.trim()) return;
    prizeEmailSending = true;
    prizeEmailMessage = '';
    prizeEmailMessageStatus = 'idle';
    try {
      const res = await fetch('/api/prizes/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: claimedClaimId, email: prizeEmail.trim() }),
      });
      const data = await res.json();
      prizeEmailMessage = res.ok ? 'Prize email sent.' : (data.error ?? 'Unable to send prize email');
      prizeEmailMessageStatus = res.ok ? 'success' : 'error';
    } catch {
      prizeEmailMessage = 'Unable to send prize email';
      prizeEmailMessageStatus = 'error';
    } finally {
      prizeEmailSending = false;
    }
  }

</script>

<div class="min-h-full flex flex-col">
  {#if state}
    <PlayerNav
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
            onclick={enableWakeFromTap}
          >
            Enable screen wake
          </button>
        </div>
      {/if}
    {/if}
    {#if !state}
      <PlayerJoinForm
        roomId={roomId ?? ''}
        bind:joinPassword
        bind:name
        bind:emoji
        mode={joinMode}
        {joinError}
        {requestFormUnavailableEmojis}
        {joiningRoom}
        kickedType={wasKickedFromRoom ?? 'kicked'}
        onJoin={(pw?, n?, e?) => {
          if (deniedByHost) {
            deniedByHost = false;
            joinError = '';
          }
          joinRoom(getOrCreatePlayerId(), pw ?? joinPassword, n ?? name, e ?? emoji);
        }}
        onTryAgain={() => {
          try {
            sessionStorage.removeItem('wasKicked_' + roomId);
          } catch {
            /* ignore */
          }
          wasKickedFromRoom = null;
          joinRoom(getOrCreatePlayerId(), joinPassword);
        }}
      />
    {:else if state?.type === 'Lobby' && !registered}
      <PlayerLobbyForm
        bind:name
        bind:emoji
        {unavailableEmojis}
        {registerError}
        onRegister={() => register()}
      />
    {:else if state?.type === 'Lobby'}
      <div class="bg-pub-darker rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">Waiting for host to start</h2>
        <p class="text-pub-muted">Room: <span class="text-pub-gold font-mono">{roomId}</span></p>
        <p class="text-pub-muted mt-2">Players: {(state?.players ?? []).length}</p>
      </div>
    {:else if state?.type === 'QuestionPreview'}
      <div class="bg-pub-darker rounded-lg p-6 text-center">
        <h2 class="text-xl font-bold mb-2">Get Ready</h2>
        <p class="text-pub-muted">Next question coming up</p>
      </div>
    {:else if state?.type === 'Question'}
      {#key `${state?.currentRoundIndex ?? 0}-${state?.currentQuestionIndex ?? 0}-${state?.quizFilename ?? ''}`}
      {#if currentQuestion}
      <PlayerQuestionForm
        question={currentQuestion}
        roundName={state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
        roomId={roomId ?? ''}
        {currentQuestionNumber}
        {currentRoundQuestionTotal}
        {totalTimerSeconds}
        {countdown}
        quizFilename={state.quizFilename}
        {optionLabelStyle}
        {questionTimeExpired}
        {hasAnsweredCurrentQuestion}
        {showTimesUpMessage}
        {submitError}
        {hasSubmitted}
        {getSubmittedAnswerIndex}
        {getSubmittedAnswerIndexes}
        {getSubmittedHotspot}
        {isHotspotSubmitted}
        {isMultiSelectSubmitted}
        {isReorderSubmitted}
        {isMatchingSubmitted}
        {isSliderSubmitted}
        {isInputSubmitted}
        {getSelectedOptionLabel}
        {getSelectedOptionLabels}
        {getSubmittedAnswerNumber}
        {selectedAnswer}
        {selectedMultiSelect}
        bind:multiSelectDraft
        bind:reorderDraft
        bind:sliderAnswer
        bind:inputAnswer
        hotspotDraftByQuestionId={hotspotDraftByQuestionId}
        updateHotspotDraft={updateHotspotDraft}
        bind:matchingDraft
        emoji={playerDisplayEmoji}
        {submitChoice}
        {submitMultiSelect}
        {submitReorder}
        {submitMatching}
        {submitSlider}
        {submitHotspot}
        {submitInput}
        {toggleMultiSelectDraft}
      />
      {/if}
      {/key}
    {:else if state?.type === 'RevealAnswer'}
      <PlayerRevealView
        question={currentQuestion}
        roundName={state.quiz?.rounds?.[state.currentRoundIndex]?.name ?? 'Round'}
        roomId={roomId ?? ''}
        currentQuestionNumber={currentQuestionNumber}
        currentRoundQuestionTotal={currentRoundQuestionTotal}
        countdown={countdown}
        totalTimerSeconds={totalTimerSeconds}
        quizFilename={state.quizFilename}
        optionLabelStyle={optionLabelStyle}
        revealData={revealData}
        playerEmoji={playerDisplayEmoji}
        playerName={playerDisplayName}
      />
    {:else if state?.type === 'Scoreboard' || state?.type === 'End'}
      <div class="space-y-4">
        <SessionLeaderboardView
          title={state.type === 'End' ? 'Quiz ended by host' : 'Leaderboard'}
          isEnd={state.type === 'End'}
          players={sortPlayersByScore(state.players)}
        />
        {#if state.type === 'End' && prizeFeatureEnabled}
          <div class="rounded-lg bg-pub-darker p-6 space-y-4">
            <h2 class="text-xl font-bold text-pub-gold">Prizes</h2>
            {#if claimedPrizes.length > 0}
              <p class="text-pub-muted">
                Your prize{claimedPrizes.length === 1 ? ' is' : 's are'} ready. Save {claimedPrizes.length === 1 ? 'it' : 'them'} now if you want to keep {claimedPrizes.length === 1 ? 'it' : 'them'}.
              </p>
              <div class="space-y-3">
                {#each claimedPrizes as prize, index}
                  <div class="rounded-lg border border-pub-gold/30 bg-pub-dark p-4 space-y-2">
                    <p class="text-xs uppercase tracking-wide text-pub-muted">Prize {index + 1}</p>
                    <p class="font-semibold text-pub-gold">{prize.prizeName}</p>
                    <a
                      href={prize.prizeUrl}
                      target="_blank"
                      rel="noreferrer"
                      class="inline-flex items-center justify-center rounded-lg bg-pub-accent px-4 py-3 font-medium text-white hover:opacity-90"
                    >
                      Open Prize Link
                    </a>
                    <p class="break-all text-sm text-pub-muted">{prize.prizeUrl}</p>
                  </div>
                {/each}
              </div>
              {#if prizeEmailAvailableNow}
                <div class="space-y-2">
                  <label class="block text-sm text-pub-muted" for="prize-email">
                    Email {claimedPrizes.length === 1 ? 'this link' : 'these links'} now (optional)
                  </label>
                  <div class="flex flex-col sm:flex-row gap-2">
                    <input
                      id="prize-email"
                      type="email"
                      bind:value={prizeEmail}
                      placeholder="you@example.com"
                      class="flex-1 rounded-lg border border-pub-muted bg-pub-dark px-4 py-2"
                    />
                    <button
                      type="button"
                      class="rounded-lg bg-pub-accent px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
                      onclick={sendPrizeEmailNow}
                      disabled={prizeEmailSending || !prizeEmail.trim()}
                    >
                      {prizeEmailSending ? 'Sending...' : 'Send email'}
                    </button>
                  </div>
                  <div class="rounded-lg border border-pub-muted/50 bg-pub-dark px-3 py-2 text-xs text-pub-muted">
                    We use your email address only to send the prize link{claimedPrizes.length === 1 ? '' : 's'}. We do not retain it after the code is sent.
                  </div>
                  {#if prizeEmailMessage}
                    <p class="text-sm {prizeEmailMessageStatus === 'success' ? 'text-green-400' : 'text-red-400'}">
                      {prizeEmailMessage}
                    </p>
                  {/if}
                </div>
              {/if}
            {:else if prizeEligibilityLoading}
              <p class="text-pub-muted">Checking prize eligibility...</p>
            {:else if prizeClaiming}
              <p class="text-pub-muted">
                Unlocking your prize{prizeOptions.length === 1 ? '' : 's'}...
              </p>
            {:else if prizeEligible && prizeOptions.length > 0}
              <div class="space-y-2">
                <p class="text-pub-muted">
                  Unlocking {prizeOptions.length === 1 ? 'your prize' : 'your prizes'} automatically:
                </p>
                <ul class="space-y-2">
                  {#each prizeOptions as prize}
                    <li class="rounded-lg border border-pub-muted/50 bg-pub-dark px-4 py-3 text-pub-gold">
                      {prize.name}
                    </li>
                  {/each}
                </ul>
              </div>
            {:else}
              <p class="text-pub-muted">{prizeStatusMessage || 'No prizes are available for this player.'}</p>
            {/if}
            {#if prizeClaimError}
              <p class="text-sm text-red-400">{prizeClaimError}</p>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <p class="text-pub-muted">Connecting...</p>
    {/if}
  </div>
  </div>
</div>

<PlayerExitModal
  open={showExitModal}
  inLobby={inLobby}
  leavingQuiz={leavingQuiz}
  onClose={() => (showExitModal = false)}
  onExit={exitQuiz}
/>

<PlayerSettingsModal
  open={showSettingsModal}
  bind:draftName={settingsDraftName}
  bind:draftEmoji={settingsDraftEmoji}
  registerError={registerError}
  unavailableEmojis={unavailableEmojisForSettings}
  emojiOptions={EMOJI_OPTIONS}
  onClose={() => { showSettingsModal = false; registerError = ''; }}
  onSave={saveSettingsFromModal}
/>

<PlayerWakeModal
  open={showWakeEnableModal}
  onClose={closeWakeEnableModal}
  onEnable={enableWakeFromTap}
/>
