<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { mapHostCreateError, resolveHostCreatePassword } from '$lib/auth/host-create.js';
  import { createSocket } from '$lib/socket.js';
  import { socketStore } from '$lib/stores/socket.js';
  import { createSettlementGuard } from '$lib/utils/settlement-guard.js';

  let mode: 'choose' | 'host' | 'play' = 'choose';
  let quizFilename = '';
  let roomId = '';
  let hostPassword = '';
  let passwordError = '';
  let creating = false;
  let hostAuthenticated = false;

  $: quizzes = $page.data.quizzes ?? [];
  $: hostPasswordRequired = $page.data.hostPasswordRequired ?? false;
  $: if (quizzes.length > 0 && !quizFilename) quizFilename = quizzes[0];
  $: if (typeof window !== 'undefined' && $page.url.searchParams.get('host') === '1' && mode === 'choose') {
    mode = 'host';
    if (hostPasswordRequired) {
      refreshHostAuthState();
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
  }

  function startAsPlayer() {
    mode = 'play';
  }

  async function createRoom() {
    if (!quizFilename) return;
    passwordError = '';
    creating = true;
    try {
      if (hostPasswordRequired) {
        const checkRes = await fetch('/api/auth/check', { credentials: 'include' });
        const { authenticated } = await checkRes.json();
        hostAuthenticated = authenticated ?? false;
        if (!authenticated) {
          if (!hostPassword.trim() && !hostAuthenticated) {
            passwordError = 'Password required';
            creating = false;
            return;
          }
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: hostPassword }),
            credentials: 'include',
          });
          if (!loginRes.ok) {
            const data = await loginRes.json();
            passwordError = data.error ?? 'Invalid password';
            creating = false;
            return;
          }
          hostAuthenticated = true;
        }
      }
    } catch {
      creating = false;
      passwordError = 'Unable to create room. Please try again.';
      return;
    }

    const payload: { quizFilename: string; password?: string } = { quizFilename };
    payload.password = resolveHostCreatePassword(hostPasswordRequired, hostPassword);
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
    if (!id) return;
    goto(`/play/${id}`);
  }
</script>

<div class="min-h-screen flex flex-col items-center justify-center p-6">
  <h1 class="text-4xl font-bold text-pub-gold mb-2">Let's Go Quizzing</h1>
  <p class="text-pub-muted mb-8">The Markdown of Quiz Apps</p>
  {#if mode === 'choose'}
    <div class="flex flex-col gap-4 items-center">
      {#if !hostPasswordRequired}
        <p class="text-amber-500 text-sm text-center max-w-md">
          Hosting and quiz creation are disabled. Set HOST_PASSWORD to enable.
        </p>
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
    <form
      class="w-full max-w-md space-y-4"
      on:submit|preventDefault={createRoom}
    >
      <label for="quiz-select" class="block text-sm text-pub-muted">Select Quiz</label>
      <select
        id="quiz-select"
        bind:value={quizFilename}
        class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
      >
        {#each quizzes as q}
          <option value={q}>{q}</option>
        {/each}
      </select>
      {#if hostPasswordRequired && !hostAuthenticated}
        <div>
          <label for="host-password" class="block text-sm text-pub-muted mb-1">Host password</label>
          <input
            id="host-password"
            type="password"
            bind:value={hostPassword}
            placeholder="Enter host password"
            class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
          />
          {#if passwordError}
            <p class="mt-1 text-sm text-red-400">{passwordError}</p>
          {/if}
        </div>
      {:else if hostAuthenticated}
        <p class="text-sm text-green-400">Authenticated (session active)</p>
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
