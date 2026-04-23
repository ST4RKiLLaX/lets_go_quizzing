<script lang="ts">
  import { goto } from '$app/navigation';
  import { toast } from '$lib/stores/toasts.js';

  export let data;
  let username = '';
  let password = '';
  let passwordConfirm = '';
  let origin = '';
  let roomIdLen = 6;
  let submitting = false;

  async function submit() {
    submitting = true;
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          passwordConfirm,
          origin: origin.trim() || undefined,
          roomIdLen: Number(roomIdLen) || 6,
        }),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Setup failed');
        return;
      }
      toast.success(data.migrationMode ? 'Migration complete' : 'Setup complete');
      goto('/');
    } catch {
      toast.error('Setup failed');
    } finally {
      submitting = false;
    }
  }
</script>

<div class="min-h-full flex items-center justify-center p-6 bg-pub-dark">
  <div class="w-full max-w-md">
    <h1 class="text-2xl font-bold text-pub-gold mb-2">Let's Go Quizzing</h1>
    <p class="text-pub-muted mb-6">Complete setup to get started</p>

    {#if data.recoveryMode}
      <div class="mb-4 p-4 rounded-lg bg-amber-900/50 border border-amber-600 text-amber-200 text-sm">
        Recovery mode – setup is re-enabled for emergency use. Complete setup to restore access.
      </div>
    {:else if data.migrationMode}
      <div class="mb-4 p-4 rounded-lg bg-amber-900/50 border border-amber-600 text-amber-200 text-sm">
        We found an old password in your .env. Choose a username and password below to migrate to the config file. Your new credentials will replace the env-based setup.
      </div>
    {/if}

    <form
      class="space-y-4"
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <label for="setup-username" class="block text-sm text-pub-muted mb-1">Admin username</label>
        <input
          id="setup-username"
          name="username"
          type="text"
          bind:value={username}
          autocomplete="username"
          placeholder="admin"
          minlength={3}
          maxlength={50}
          required
          class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
        />
        <p class="mt-1 text-xs text-pub-muted">3–50 characters</p>
      </div>
      <div>
        <label for="setup-password" class="block text-sm text-pub-muted mb-1">Admin password</label>
        <input
          id="setup-password"
          name="new-password"
          type="password"
          bind:value={password}
          autocomplete="new-password"
          placeholder="••••••••"
          minlength={8}
          required
          class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
        />
        <p class="mt-1 text-xs text-pub-muted">At least 8 characters</p>
      </div>
      <div>
        <label for="setup-password-confirm" class="block text-sm text-pub-muted mb-1"
          >Confirm password</label
        >
        <input
          id="setup-password-confirm"
          name="new-password-confirm"
          type="password"
          bind:value={passwordConfirm}
          autocomplete="new-password"
          placeholder="••••••••"
          required
          class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
        />
      </div>
      <div>
        <label for="setup-origin" class="block text-sm text-pub-muted mb-1"
          >ORIGIN (optional)</label
        >
        <input
          id="setup-origin"
          type="text"
          bind:value={origin}
          placeholder="https://quiz.example.com"
          class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
        />
        <p class="mt-1 text-xs text-pub-muted">Comma-separated for multiple. Leave blank for dev.</p>
      </div>
      <div>
        <label for="setup-room-id-len" class="block text-sm text-pub-muted mb-1"
          >Room code length</label
        >
        <input
          id="setup-room-id-len"
          type="number"
          bind:value={roomIdLen}
          min={4}
          max={12}
          class="w-full bg-pub-darker border border-pub-muted rounded-lg px-4 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        class="w-full px-6 py-3 bg-pub-gold text-pub-darker font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Setting up...' : 'Complete setup'}
      </button>
    </form>
  </div>
</div>
