<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { createSocket } from '$lib/socket.js';

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
      fetch('/api/auth/check', { credentials: 'include' }).then((r) => r.json()).then((d) => {
        hostAuthenticated = d.authenticated ?? false;
      });
    }
  }

  async function startAsHost() {
    mode = 'host';
    passwordError = '';
    if (hostPasswordRequired) {
      const res = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await res.json();
      hostAuthenticated = data.authenticated ?? false;
    }
  }

  function startAsPlayer() {
    mode = 'play';
  }

  async function createRoom() {
    if (!quizFilename) return;
    passwordError = '';
    creating = true;
    if (hostPasswordRequired) {
      const checkRes = await fetch('/api/auth/check', { credentials: 'include' });
      const { authenticated } = await checkRes.json();
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
      }
    }
    const payload: { quizFilename: string; password?: string } = { quizFilename };
    const typedPassword = hostPassword.trim();
    let storedPassword = '';
    if (hostPasswordRequired) {
      try {
        storedPassword = sessionStorage.getItem('lgq_host_password')?.trim() ?? '';
      } catch {
        /* ignore */
      }
    }
    // Deterministic fallback order: typed password -> stored password -> none
    payload.password = typedPassword || storedPassword || undefined;

    const socket = createSocket();
    const onAck = (ack: { roomId?: string; error?: string }) => {
      creating = false;
      socket.disconnect();
      socket.removeAllListeners();
      if (ack?.roomId) {
        // Security: password stored in sessionStorage to allow creating new rooms after game end.
        // Risk: plaintext in client; acceptable for single-user host devices. Avoid on shared PCs.
        if (hostPasswordRequired && hostPassword.trim()) {
          try {
            sessionStorage.setItem('lgq_host_password', hostPassword);
          } catch {
            /* ignore */
          }
        }
        goto(`/host/${ack.roomId}`);
      } else {
        if (ack?.error === 'Invalid password') {
          hostAuthenticated = false;
          passwordError = 'Session expired. Enter host password again.';
        } else {
          passwordError = ack?.error ?? 'Failed to create room';
        }
      }
    };
    const doEmit = () => {
      socket.emit('host:create', payload, (ack: { roomId?: string; error?: string }) => {
        if (ack?.roomId || ack?.error) {
          onAck(ack);
        } else {
          creating = false;
          passwordError = 'Connection lost. Please try again.';
        }
      });
    };
    const timeout = setTimeout(() => {
      creating = false;
      socket.disconnect();
      socket.removeAllListeners();
      passwordError = 'Connection timeout. Please try again.';
    }, 15000);
    if (socket.connected) {
      clearTimeout(timeout);
      doEmit();
    } else {
      socket.once('connect', () => {
        clearTimeout(timeout);
        doEmit();
      });
      socket.once('connect_error', () => {
        clearTimeout(timeout);
        creating = false;
        socket.disconnect();
        socket.removeAllListeners();
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
