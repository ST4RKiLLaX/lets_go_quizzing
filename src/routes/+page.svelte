<script lang="ts">
  import { afterNavigate, goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { onDestroy, onMount } from 'svelte';
  import { mapHostCreateError, resolveHostCreatePassword } from '$lib/auth/host-create.js';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import PrizeTierEditor from '$lib/components/prizes/PrizeTierEditor.svelte';
  import { findUnavailablePrizeId } from '$lib/prizes/config-validation.js';
  import { buildDefaultRoomPrizeConfig, normalizePrizeTiers } from '$lib/prizes/tiers.js';
  import { createSocket } from '$lib/socket.js';
  import { socketStore } from '$lib/stores/socket.js';
  import { createSettlementGuard } from '$lib/utils/settlement-guard.js';
  import { toast } from '$lib/stores/toasts.js';
  import type { QuizListItem } from '$lib/types/quiz-list.js';
  import type { PrizeOption, PrizeTier } from '$lib/types/prizes.js';

  let mode: 'choose' | 'host' | 'play' = 'choose';
  let quizFilename = '';
  let roomId = '';
  let hostUsername = '';
  let hostPassword = '';
  let playerJoinPassword = '';
  let waitingRoomEnabled = false;
  let allowLateJoin = false;
  let autoAdmitBeforeGame = true;
  let manualAdmitAfterGame = true;
  let passwordError = '';
  let creating = false;
  let hostAuthenticated = false;
  let showQuizMenu = false;
  let quizzes: QuizListItem[] = [];
  let hostPasswordRequired = false;
  let highlightedQuizIndex = -1;
  let quizMenuRoot: HTMLDivElement | null = null;
  let prizeFeatureEnabled = false;
  let prizeOptions: PrizeOption[] = [];
  let defaultRoomPrizeEnabled = false;
  let defaultRoomPrizeTiers: PrizeTier[] = [];
  let roomPrizeEnabled = false;
  let roomPrizeTiers: PrizeTier[] = [];
  let savePrizeSetupAsDefault = false;
  let prizeOptionsLoaded = false;
  let loadingPrizeOptions = false;
  let showInsufficientPrizeModal = false;
  let insufficientPrizeName = '';

  const quizSelectLabelId = 'quiz-select-label';
  const quizSelectListboxId = 'quiz-select-listbox';

  $: quizzes = ($page.data.quizzes ?? []) as QuizListItem[];
  $: hostPasswordRequired = $page.data.hostPasswordRequired ?? false;
  $: needsSetup = $page.data.needsSetup ?? false;
  $: if (quizzes.length > 0 && !quizFilename) quizFilename = quizzes[0].filename;
  $: selectedQuiz = quizzes.find((q) => q.filename === quizFilename) ?? null;
  $: if (showQuizMenu) {
    highlightedQuizIndex = Math.max(0, quizzes.findIndex((q) => q.filename === quizFilename));
  }
  $: if (typeof window !== 'undefined' && needsSetup && !hostPasswordRequired && $page.url.pathname === '/') {
    goto('/setup');
  }
  $: if (typeof window !== 'undefined' && $page.url.searchParams.get('host') === '1' && mode === 'choose') {
    mode = 'host';
    if (hostPasswordRequired) {
      refreshHostAuthState();
    }
  }

  /** Deep link from creator quiz list: /?host=1&quiz=filename.yaml */
  afterNavigate(({ to }) => {
    if (to?.url.pathname !== '/') return;
    const param = to.url.searchParams.get('quiz');
    if (!param) return;
    const list = (get(page).data.quizzes ?? []) as QuizListItem[];
    if (list.some((q) => q.filename === param)) {
      quizFilename = param;
    }
  });

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!showQuizMenu || !quizMenuRoot) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!quizMenuRoot.contains(target)) {
        closeQuizMenu();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  });

  onDestroy(() => {
    closeQuizMenu();
  });

  function applyDefaultPrizeConfig() {
    roomPrizeEnabled = defaultRoomPrizeEnabled;
    roomPrizeTiers = defaultRoomPrizeTiers.map((tier) => ({ ...tier, prizeIds: [...tier.prizeIds] }));
    savePrizeSetupAsDefault = false;
  }

  function getRoomPrizeTierDisabledReason(): string {
    if (prizeOptions.length === 0) {
      return 'Add an active, unexpired prize in settings first.';
    }
    if (prizeOptions.every((prize) => prize.remainingQuantity === 0)) {
      return 'All available prizes are fully claimed. Increase quantity or add a new prize in settings.';
    }
    return '';
  }

  async function loadPrizeOptions() {
    if (loadingPrizeOptions) return;
    loadingPrizeOptions = true;
    try {
      const res = await fetch('/api/prizes/options');
      const data = await res.json();
      prizeFeatureEnabled = data.enabled === true;
      prizeOptions = Array.isArray(data.prizes) ? data.prizes : [];
      defaultRoomPrizeEnabled = data.defaultRoomPrizeConfig?.enabledByDefault ?? false;
      defaultRoomPrizeTiers = data.defaultRoomPrizeConfig?.tiers ?? [];
      applyDefaultPrizeConfig();
    } catch {
      prizeFeatureEnabled = false;
      prizeOptions = [];
      defaultRoomPrizeEnabled = false;
      defaultRoomPrizeTiers = [];
      roomPrizeEnabled = false;
      roomPrizeTiers = [];
      toast.warning('Could not load prize options. Prizes disabled for this session.');
    } finally {
      loadingPrizeOptions = false;
      prizeOptionsLoaded = true;
    }
  }

  function openQuizMenu() {
    showQuizMenu = true;
  }

  function closeQuizMenu() {
    showQuizMenu = false;
    highlightedQuizIndex = -1;
  }

  function selectQuizByIndex(index: number) {
    if (index < 0 || index >= quizzes.length) return;
    quizFilename = quizzes[index].filename;
    closeQuizMenu();
  }

  function moveQuizHighlight(delta: number) {
    if (quizzes.length === 0) return;
    if (!showQuizMenu) openQuizMenu();
    if (highlightedQuizIndex < 0) {
      highlightedQuizIndex = Math.max(0, quizzes.findIndex((q) => q.filename === quizFilename));
      return;
    }
    highlightedQuizIndex = (highlightedQuizIndex + delta + quizzes.length) % quizzes.length;
  }

  function onQuizTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveQuizHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveQuizHighlight(-1);
      return;
    }
    if (event.key === 'Escape') {
      if (showQuizMenu) {
        event.preventDefault();
        closeQuizMenu();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!showQuizMenu) {
        openQuizMenu();
      } else {
        const targetIndex =
          highlightedQuizIndex >= 0
            ? highlightedQuizIndex
            : Math.max(0, quizzes.findIndex((q) => q.filename === quizFilename));
        selectQuizByIndex(targetIndex);
      }
    }
  }

  function onQuizListKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveQuizHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveQuizHighlight(-1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuizMenu();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (highlightedQuizIndex >= 0) {
        selectQuizByIndex(highlightedQuizIndex);
      }
    }
  }

  async function refreshHostAuthState() {
    try {
      const res = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await res.json();
      hostAuthenticated = data.authenticated ?? false;
    } catch {
      hostAuthenticated = false;
    }
  }

  async function startAsHost() {
    mode = 'host';
    passwordError = '';
    if (hostPasswordRequired) {
      try {
        await refreshHostAuthState();
      } catch {
        hostAuthenticated = false;
        passwordError = 'Unable to verify authentication. Please try again.';
      }
    }
    if (!prizeOptionsLoaded) {
      await loadPrizeOptions();
    }
  }

  $: if (mode === 'host' && !prizeOptionsLoaded) {
    void loadPrizeOptions();
  }

  function startAsPlayer() {
    mode = 'play';
  }

  async function createRoom() {
    if (!quizFilename) return;
    passwordError = '';
    const sanitizedRoomPrizeTiers = normalizePrizeTiers(roomPrizeTiers);

    if (prizeFeatureEnabled && roomPrizeEnabled && sanitizedRoomPrizeTiers.length === 0) {
      creating = false;
      toast.error('Add at least one prize tier or turn room prizes off.');
      return;
    }

    if (prizeFeatureEnabled && roomPrizeEnabled) {
      const insufficientPrizeId = findUnavailablePrizeId(sanitizedRoomPrizeTiers, prizeOptions);
      if (insufficientPrizeId) {
        insufficientPrizeName =
          prizeOptions.find((option) => option.id === insufficientPrizeId)?.name ?? 'Selected prize';
        showInsufficientPrizeModal = true;
        return;
      }
    }

    creating = true;
    try {
      if (hostPasswordRequired) {
        const checkRes = await fetch('/api/auth/check', { credentials: 'include' });
        const { authenticated } = await checkRes.json();
        hostAuthenticated = authenticated ?? false;
        if (!authenticated) {
          if ((!hostUsername.trim() || !hostPassword.trim()) && !hostAuthenticated) {
            passwordError = 'Username and password required';
            creating = false;
            return;
          }
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: hostUsername.trim(), password: hostPassword }),
            credentials: 'include',
          });
          if (!loginRes.ok) {
            const data = await loginRes.json();
            passwordError = data.error ?? 'Invalid password';
            creating = false;
            return;
          }
          await invalidateAll();
          hostAuthenticated = true;
        }
      }
    } catch {
      creating = false;
      passwordError = 'Unable to create room. Please try again.';
      return;
    }

    if (prizeFeatureEnabled && savePrizeSetupAsDefault) {
      const saveDefaultRes = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          defaultRoomPrizeConfig: buildDefaultRoomPrizeConfig(roomPrizeEnabled, sanitizedRoomPrizeTiers),
        }),
      });
      const saveDefaultData = await saveDefaultRes.json();
      if (!saveDefaultRes.ok) {
        creating = false;
        toast.error(saveDefaultData.error ?? 'Failed to save default prize setup');
        return;
      }
    }

    const payload: {
      quizFilename: string;
      username?: string;
      password?: string;
      playerJoinPassword?: string;
      waitingRoomEnabled?: boolean;
      allowLateJoin?: boolean;
      autoAdmitBeforeGame?: boolean;
      manualAdmitAfterGame?: boolean;
      roomPrizeConfig?: { enabled: boolean; tiers: PrizeTier[] };
    } = { quizFilename };
    if (hostPasswordRequired) {
      payload.username = hostUsername.trim() || undefined;
      payload.password = resolveHostCreatePassword(hostPasswordRequired, hostPassword);
    }
    const trimmedPlayerJoinPassword = playerJoinPassword.trim();
    if (trimmedPlayerJoinPassword) {
      payload.playerJoinPassword = trimmedPlayerJoinPassword;
    }
    if (waitingRoomEnabled) {
      payload.waitingRoomEnabled = true;
      payload.autoAdmitBeforeGame = autoAdmitBeforeGame;
      payload.manualAdmitAfterGame = manualAdmitAfterGame;
    }
    if (allowLateJoin) {
      payload.allowLateJoin = true;
    }
    if (prizeFeatureEnabled && roomPrizeEnabled) {
      payload.roomPrizeConfig = { enabled: true, tiers: sanitizedRoomPrizeTiers };
    }
    const socket = createSocket();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finalize = createSettlementGuard(() => {
      if (timeout != null) clearTimeout(timeout);
      creating = false;
      socket.disconnect();
      socket.removeAllListeners();
    });
    const onAck = (ack: { roomId?: string; error?: string }) => {
      if (!finalize()) return;
      if (ack?.roomId) {
        if (typeof window !== 'undefined' && hostPasswordRequired && hostPassword) {
          try {
            sessionStorage.setItem('lgq_host_username', hostUsername.trim());
            sessionStorage.setItem('lgq_host_password', hostPassword);
          } catch {
            /* ignore */
          }
        }
        socketStore.get()?.disconnect();
        goto(`/host/${ack.roomId}`);
      } else {
        const mapped = mapHostCreateError(ack?.error);
        if (mapped.clearAuthenticated) {
          hostAuthenticated = false;
        }
        passwordError = mapped.message;
      }
    };
    const doEmit = () => {
      socket.emit('host:create', payload, (ack: { roomId?: string; error?: string }) => {
        if (ack?.roomId || ack?.error) {
          onAck(ack);
        } else {
          if (!finalize()) return;
          passwordError = 'Connection lost. Please try again.';
        }
      });
    };
    timeout = setTimeout(() => {
      if (!finalize()) return;
      passwordError = 'Connection timeout. Please try again.';
    }, 15000);
    if (socket.connected) {
      doEmit();
    } else {
      socket.once('connect', () => {
        if (timeout == null) return;
        doEmit();
      });
      socket.once('connect_error', () => {
        if (!finalize()) return;
        hostAuthenticated = false;
        passwordError = 'Connection failed. Please try again.';
      });
    }
  }

  function goToPlay() {
    const id = roomId.trim().toUpperCase();
    if (!id) {
      toast.warning('Enter a room code to join.');
      return;
    }
    goto(`/play/${id}`);
  }
</script>

<div class="min-h-full flex flex-col items-center justify-center px-6 pb-6 pt-15 sm:pt-16">
  <h1 class="text-4xl font-bold text-pub-gold mb-2">Let's Go Quizzing</h1>
  <p class="text-pub-muted mb-8">The Markdown of Quiz Apps</p>
  {#if mode === 'choose'}
    <div class="flex flex-col gap-4 items-center">
      {#if needsSetup && hostPasswordRequired}
        <p class="text-amber-500 text-sm text-center max-w-md">
          Using password from .env. <a href="/setup" class="text-pub-accent underline">Migrate to config</a> for persistent setup.
        </p>
      {:else if !hostPasswordRequired}
        <div class="text-center max-w-md space-y-3">
          <p class="text-amber-500 text-sm">
            Hosting and quiz creation are disabled. Complete setup to get started.
          </p>
          <a
            href="/setup"
            class="inline-block px-6 py-3 bg-pub-gold text-pub-darker font-semibold rounded-lg hover:opacity-90"
          >
            Complete setup
          </a>
        </div>
      {/if}
      <div class="flex gap-4">
        <button
          class="px-6 py-3 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          on:click={startAsHost}
          disabled={!hostPasswordRequired}
        >
          Host a Game
        </button>
      <button
        class="px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90"
        on:click={startAsPlayer}
      >
        Join a Game
      </button>
      </div>
      {#if hostPasswordRequired}
        <a
          href="/creator"
          class="block mt-4 px-6 py-3 bg-pub-darker rounded-lg font-medium hover:opacity-90 border border-pub-muted text-center"
        >
          Create or edit quizzes
        </a>
      {:else}
        <span class="block mt-4 text-pub-muted text-sm">Create or edit quizzes (disabled)</span>
      {/if}
    </div>
  {:else if mode === 'host'}
    <form class="w-full max-w-3xl space-y-4" on:submit|preventDefault={createRoom}>
      <div class="rounded-xl border border-pub-muted bg-pub-darker p-4 sm:p-5 space-y-4">
        <div>
          <p id={quizSelectLabelId} class="block text-sm text-pub-muted">Select Quiz</p>
          <div class="relative mt-1" bind:this={quizMenuRoot}>
        <button
          type="button"
          class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2 text-left hover:opacity-90"
          on:click={() => (showQuizMenu ? closeQuizMenu() : openQuizMenu())}
          on:keydown={onQuizTriggerKeydown}
          aria-labelledby={quizSelectLabelId}
          aria-haspopup="listbox"
          aria-controls={quizSelectListboxId}
          aria-expanded={showQuizMenu}
        >
          {#if selectedQuiz}
            <span class="block">{selectedQuiz.title}</span>
            <span class="block text-xs text-pub-muted mt-0.5">{selectedQuiz.filename}</span>
          {:else}
            <span class="block text-pub-muted">Select a quiz</span>
          {/if}
        </button>
          {#if showQuizMenu}
            <div
              id={quizSelectListboxId}
              role="listbox"
              tabindex="-1"
              aria-labelledby={quizSelectLabelId}
              class="absolute z-20 mt-2 w-full bg-pub-darker border border-pub-muted rounded-lg shadow-lg max-h-64 overflow-auto"
              on:keydown={onQuizListKeydown}
            >
              {#each quizzes as q, i}
                <button
                  type="button"
                  role="option"
                  aria-selected={q.filename === quizFilename}
                  class="w-full text-left px-4 py-2 hover:bg-pub-dark border-b border-pub-muted/40 last:border-b-0 {i === highlightedQuizIndex ? 'bg-pub-dark' : ''}"
                  on:mouseenter={() => (highlightedQuizIndex = i)}
                  on:click={() => {
                    selectQuizByIndex(i);
                  }}
                >
                  <span class="block">{q.title}</span>
                  <span class="block text-xs text-pub-muted mt-0.5">{q.filename}</span>
                </button>
              {/each}
            </div>
          {/if}
          </div>
        </div>

      {#if hostPasswordRequired && !hostAuthenticated}
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label for="host-username" class="block text-sm text-pub-muted mb-1">Username</label>
            <input
              id="host-username"
              name="username"
              type="text"
              bind:value={hostUsername}
              autocomplete="username"
              placeholder="Admin username"
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label for="host-password" class="block text-sm text-pub-muted mb-1">Host password</label>
            <input
              id="host-password"
              name="current-password"
              type="password"
              bind:value={hostPassword}
              autocomplete="current-password"
              placeholder="Enter host password"
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
            {#if passwordError}
              <p class="mt-1 text-sm text-red-400">{passwordError}</p>
            {/if}
          </div>
        </div>
      {:else if hostAuthenticated}
        <p class="text-sm text-green-400">Authenticated (session active)</p>
      {/if}

        <div>
          <label for="player-join-password" class="block text-sm text-pub-muted mb-1">
            Player join password (optional)
          </label>
          <input
            id="player-join-password"
            name="room-password"
            type="password"
            bind:value={playerJoinPassword}
            autocomplete="off"
            placeholder="Require password for players joining this room"
            class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
          />
        </div>

        <div class="rounded-lg border border-pub-muted/60 bg-pub-dark p-4 space-y-3">
          <label class="flex items-start gap-2">
            <input
              id="waiting-room-enabled"
              type="checkbox"
              bind:checked={waitingRoomEnabled}
              class="mt-0.5 rounded border-pub-muted bg-pub-dark"
            />
            <span class="text-sm text-pub-muted">
              Waiting room (host approves players before they join)
            </span>
          </label>
          {#if waitingRoomEnabled}
            <div class="space-y-3 pl-6">
              <label class="flex items-start gap-2">
                <input
                  id="auto-admit-before-game"
                  type="checkbox"
                  bind:checked={autoAdmitBeforeGame}
                  class="mt-0.5 rounded border-pub-muted bg-pub-dark"
                />
                <span class="text-sm text-pub-muted">Auto-admit before game starts</span>
              </label>
              <label class="flex items-start gap-2">
                <input
                  id="allow-late-join"
                  type="checkbox"
                  bind:checked={allowLateJoin}
                  class="mt-0.5 rounded border-pub-muted bg-pub-dark"
                />
                <span class="text-sm text-pub-muted">Allow late join (after game starts)</span>
              </label>
              {#if allowLateJoin}
                <label class="flex items-start gap-2">
                  <input
                    id="manual-admit-after-game"
                    type="checkbox"
                    bind:checked={manualAdmitAfterGame}
                    class="mt-0.5 rounded border-pub-muted bg-pub-dark"
                  />
                  <span class="text-sm text-pub-muted">Manual admit after game starts</span>
                </label>
              {/if}
            </div>
          {/if}
        </div>
      </div>
      {#if prizeFeatureEnabled}
        <div class="rounded-lg border border-pub-muted bg-pub-darker p-4">
          <PrizeTierEditor
            bind:enabled={roomPrizeEnabled}
            bind:tiers={roomPrizeTiers}
            bind:saveAsDefault={savePrizeSetupAsDefault}
            availablePrizes={prizeOptions}
            addTierDisabledReason={getRoomPrizeTierDisabledReason()}
            title="Room prizes"
            subtitle="Optional score or rank tiers for this game only. Players can unlock prizes from every tier they match."
            showSaveDefault
            emptyMessage="No room prize tiers configured."
          />
        </div>
      {/if}
      <button
        type="submit"
        class="w-full px-6 py-3 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        disabled={creating}
      >
        {creating ? 'Creating...' : 'Create Room'}
      </button>
      <button
        type="button"
        class="w-full text-pub-muted hover:text-white"
        on:click={() => (mode = 'choose')}
      >
        Back
      </button>
    </form>
  {:else}
    <form
      class="w-full max-w-md space-y-4"
      on:submit|preventDefault={goToPlay}
    >
      <label for="room-code" class="block text-sm text-pub-muted">Room Code</label>
      <input
        id="room-code"
        type="text"
        bind:value={roomId}
        placeholder="e.g. ABCD"
        maxlength="6"
        class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2 uppercase"
      />
      <button
        type="submit"
        class="w-full px-6 py-3 bg-green-600 rounded-lg font-medium hover:opacity-90"
      >
        Join
      </button>
      <button
        type="button"
        class="w-full text-pub-muted hover:text-white"
        on:click={() => (mode = 'choose')}
      >
        Back
      </button>
    </form>
  {/if}
</div>

<ConfirmModal
  open={showInsufficientPrizeModal}
  title="Insufficient prize quantity"
  titleId="insufficient-prize-modal-title"
  cancelLabel="Close"
  confirmLabel="OK"
  confirmButtonClass="bg-pub-accent text-white"
  onClose={() => {
    showInsufficientPrizeModal = false;
  }}
  onConfirm={() => {
    showInsufficientPrizeModal = false;
  }}
>
  <p class="text-sm text-pub-muted">
    {insufficientPrizeName} is insufficient to start. Either change or remove the prize or disable prizes for the room.
  </p>
</ConfirmModal>
