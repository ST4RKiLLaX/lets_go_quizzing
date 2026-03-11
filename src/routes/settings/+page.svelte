<script lang="ts">
  import { onMount } from 'svelte';
  import HostNav from '$lib/components/HostNav.svelte';
  import { invalidateAll } from '$app/navigation';

  let username = '';
  let origin = '';
  let roomIdLen = 6;
  let currentPassword = '';
  let newPassword = '';
  let newPasswordConfirm = '';
  let envOverrides: { origin: boolean; roomIdLen: boolean } = { origin: false, roomIdLen: false };
  let error = '';
  let success = '';
  let loading = true;
  let saving = false;

  async function loadSettings() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/settings', { credentials: 'include' });
      if (res.status === 401) {
        window.location.href = '/';
        return;
      }
      const data = await res.json();
      username = data.username ?? '';
      origin = data.origin ?? '';
      roomIdLen = data.roomIdLen ?? 6;
      envOverrides = data.envOverrides ?? { origin: false, roomIdLen: false };
    } catch {
      error = 'Failed to load settings';
    } finally {
      loading = false;
    }
  }

  async function save() {
    error = '';
    success = '';
    if (!currentPassword.trim()) {
      error = 'Current password is required to save changes';
      return;
    }
    saving = true;
    try {
      const changingPassword = newPassword.length >= 8;
      const body: Record<string, unknown> = {
        currentPassword: currentPassword,
        username: username.trim(),
        origin: origin.trim() || '',
        roomIdLen: Number(roomIdLen) || 6,
      };
      if (changingPassword) {
        body.newPassword = newPassword;
        body.newPasswordConfirm = newPasswordConfirm;
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error ?? 'Update failed';
        return;
      }
      success = 'Settings saved.';
      if (changingPassword) {
        success += ' Other sessions have been invalidated.';
        currentPassword = '';
        newPassword = '';
        newPasswordConfirm = '';
      }
      if (body.origin !== undefined) {
        success += ' Changes to ORIGIN require a server restart to take effect.';
      }
      await invalidateAll();
    } catch {
      error = 'Update failed';
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    loadSettings();
  });
</script>

<HostNav />
<div class="max-w-2xl mx-auto p-6">
  <h1 class="text-2xl font-bold text-pub-gold mb-6">Settings</h1>

  {#if loading}
    <p class="text-pub-muted">Loading...</p>
  {:else}
    <form
      class="space-y-6"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <label for="settings-username" class="block text-sm text-pub-muted mb-1">Admin username</label>
        <input
          id="settings-username"
          type="text"
          bind:value={username}
          minlength={3}
          maxlength={50}
          class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
        />
        <p class="mt-1 text-xs text-pub-muted">3–50 characters</p>
      </div>

      <div>
        <h2 class="text-lg font-semibold text-pub-gold mb-3">Change password</h2>
        <div class="space-y-3">
          <div>
            <label for="settings-current-password" class="block text-sm text-pub-muted mb-1"
              >Current password</label
            >
            <input
              id="settings-current-password"
              type="password"
              bind:value={currentPassword}
              placeholder="Required to change username or password"
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label for="settings-new-password" class="block text-sm text-pub-muted mb-1"
              >New password</label
            >
            <input
              id="settings-new-password"
              type="password"
              bind:value={newPassword}
              placeholder="Leave blank to keep current"
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
            <p class="mt-1 text-xs text-pub-muted">At least 8 characters</p>
          </div>
          <div>
            <label for="settings-new-password-confirm" class="block text-sm text-pub-muted mb-1"
              >Confirm new password</label
            >
            <input
              id="settings-new-password-confirm"
              type="password"
              bind:value={newPasswordConfirm}
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            />
          </div>
        </div>
      </div>

      <div>
        <h2 class="text-lg font-semibold text-pub-gold mb-3">Deployment</h2>
        <div class="space-y-3">
          <div>
            <label for="settings-origin" class="block text-sm text-pub-muted mb-1">ORIGIN</label>
            <input
              id="settings-origin"
              type="text"
              bind:value={origin}
              disabled={envOverrides.origin}
              placeholder="https://quiz.example.com"
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {#if envOverrides.origin}
              <p class="mt-1 text-xs text-amber-500">Locked – overridden by ORIGIN env var</p>
            {:else}
              <p class="mt-1 text-xs text-pub-muted"
                >Saved to config; not active until restart. Comma-separated for multiple.</p
              >
            {/if}
          </div>
          <div>
            <label for="settings-room-id-len" class="block text-sm text-pub-muted mb-1"
              >Room code length</label
            >
            <input
              id="settings-room-id-len"
              type="number"
              bind:value={roomIdLen}
              min={4}
              max={12}
              disabled={envOverrides.roomIdLen}
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {#if envOverrides.roomIdLen}
              <p class="mt-1 text-xs text-amber-500">Locked – overridden by ROOM_ID_LEN env var</p>
            {/if}
          </div>
        </div>
      </div>

      {#if error}
        <p class="text-sm text-red-400">{error}</p>
      {/if}
      {#if success}
        <p class="text-sm text-green-400">{success}</p>
      {/if}
      <button
        type="submit"
        disabled={saving}
        class="px-6 py-2 bg-pub-gold text-pub-darker font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  {/if}
</div>
