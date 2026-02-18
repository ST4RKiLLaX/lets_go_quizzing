<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  export let data;

  let password = '';
  let error = '';
  let loggingIn = false;

  async function login() {
    error = '';
    loggingIn = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok) {
        error = result.error ?? 'Login failed';
        return;
      }
      await invalidateAll();
    } finally {
      loggingIn = false;
    }
  }
</script>

{#if data.authRequired && !data.authenticated}
  <div class="min-h-screen p-6 flex items-center justify-center">
    <div class="w-full max-w-md bg-pub-darker rounded-lg p-6">
      <h2 class="text-xl font-bold mb-4">Host authentication required</h2>
      <p class="text-pub-muted mb-4">Enter the host password to create or edit quizzes.</p>
      <div class="space-y-4">
        <div>
          <label for="creator-password" class="block text-sm text-pub-muted mb-1">Password</label>
          <input
            id="creator-password"
            type="password"
            bind:value={password}
            placeholder="Enter host password"
            class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            on:keydown={(e) => e.key === 'Enter' && login()}
          />
        </div>
        {#if error}
          <p class="text-sm text-red-400">{error}</p>
        {/if}
        <button
          class="w-full px-6 py-3 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          on:click={login}
          disabled={loggingIn || !password.trim()}
        >
          {loggingIn ? 'Logging in...' : 'Log in'}
        </button>
      </div>
      <a href="/" class="block mt-4 text-pub-muted hover:text-white text-sm">← Back to home</a>
    </div>
  </div>
{:else if !data.authRequired}
  <div class="min-h-screen p-6 flex items-center justify-center">
    <div class="w-full max-w-md bg-pub-darker rounded-lg p-6 text-center">
      <h2 class="text-xl font-bold mb-4">Quiz creation disabled</h2>
      <p class="text-pub-muted mb-4">Set HOST_PASSWORD to enable hosting and quiz creation.</p>
      <a href="/" class="text-pub-accent hover:underline">← Back to home</a>
    </div>
  </div>
{:else}
  <slot />
{/if}
