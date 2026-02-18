<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { socketStore } from '$lib/stores/socket.js';

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
    if (hostPasswordRequired && hostPassword.trim()) {
      payload.password = hostPassword;
    }
    const hasPassword = !!payload.password;
    const socket = hasPassword ? (socketStore.get() ?? socketStore.connect()) : socketStore.connect();
    const onAck = (ack: { roomId?: string; error?: string }) => {
      creating = false;
      if (ack?.roomId) {
        goto(`/host/${ack.roomId}`);
      } else {
        passwordError = ack?.error ?? 'Failed to create room';
      }
    };
    if (socket.connected) {
      socket.emit('host:create', payload, onAck);
    } else {
      socket.once('connect', () => socket.emit('host:create', payload, onAck));
    }
  }

  function goToPlay() {
    const id = roomId.trim().toUpperCase();
    if (!id) return;
    goto(`/play/${id}`);
  }
</script>

<div class="min-h-screen flex flex-col items-center justify-center p-6">
  <h1 class="text-4xl font-bold text-pub-gold mb-2">Lets Go Quizzing</h1>
  <p class="text-pub-muted mb-8">The Markdown of Quiz Apps</p>
  {#if hostPasswordRequired}
    <a href="/creator" class="mb-6 text-pub-muted hover:text-white text-sm">Create or edit quizzes →</a>
  {:else}
    <span class="mb-6 text-pub-muted text-sm">Create or edit quizzes (disabled)</span>
  {/if}

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
        class="px-6 py-3 bg-pub-darker rounded-lg font-medium hover:opacity-90 border border-pub-muted"
        on:click={startAsPlayer}
      >
        Join a Game
      </button>
      </div>
    </div>
  {:else if mode === 'host'}
    <div class="w-full max-w-md space-y-4">
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
        <p class="text-sm text-green-400">Authenticated</p>
      {/if}
      <button
        class="w-full px-6 py-3 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        on:click={createRoom}
        disabled={creating}
      >
        {creating ? 'Creating...' : 'Create Room'}
      </button>
      <button
        class="w-full text-pub-muted hover:text-white"
        on:click={() => (mode = 'choose')}
      >
        Back
      </button>
    </div>
  {:else}
    <div class="w-full max-w-md space-y-4">
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
        class="w-full px-6 py-3 bg-pub-accent rounded-lg font-medium hover:opacity-90"
        on:click={goToPlay}
      >
        Join
      </button>
      <button
        class="w-full text-pub-muted hover:text-white"
        on:click={() => (mode = 'choose')}
      >
        Back
      </button>
    </div>
  {/if}
</div>
