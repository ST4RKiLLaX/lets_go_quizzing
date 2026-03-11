<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { get } from 'svelte/store';
  import { hostQuizLiveStore } from '$lib/stores/host-quiz-live.js';

  type Tab = 'account' | 'content_filters' | 'deployment';
  let activeTab: Tab = 'account';
  let username = '';
  let originalUsername = '';
  let origin = '';
  let roomIdLen = 6;
  let profanityFilterMode: 'off' | 'names' | 'public_text' | 'strict' = 'off';
  let customKeywordFilterEnabled = false;
  let customBlockedTermsText = '';
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
      originalUsername = data.username ?? '';
      origin = data.origin ?? '';
      roomIdLen = data.roomIdLen ?? 6;
      profanityFilterMode = data.profanityFilterMode ?? 'off';
      customKeywordFilterEnabled = data.customKeywordFilterEnabled ?? false;
      customBlockedTermsText = Array.isArray(data.customBlockedTerms)
        ? data.customBlockedTerms.join('\n')
        : '';
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
    const changingCredentials =
      username.trim() !== originalUsername || newPassword.length >= 8;
    if (changingCredentials && !currentPassword.trim()) {
      error = 'Current password is required to change username or password';
      return;
    }
    saving = true;
    try {
      const body: Record<string, unknown> = {
        origin: origin.trim() || '',
        roomIdLen: Number(roomIdLen) || 6,
        profanityFilterMode,
        customKeywordFilterEnabled,
        customBlockedTerms: customBlockedTermsText
          .split('\n')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      };
      if (username.trim() !== originalUsername) {
        body.username = username.trim();
      }
      if (newPassword.length >= 8) {
        body.newPassword = newPassword;
        body.newPasswordConfirm = newPasswordConfirm;
      }
      if (changingCredentials) {
        body.currentPassword = currentPassword;
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
      if (changingCredentials) {
        success += ' Other sessions have been invalidated.';
        currentPassword = '';
        newPassword = '';
        newPasswordConfirm = '';
        if (username.trim() !== originalUsername) {
          originalUsername = username.trim();
        }
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
    const { live, roomId } = get(hostQuizLiveStore);
    if (live && roomId) {
      window.location.href = `/host/${roomId}`;
      return;
    }
    loadSettings();
  });
</script>

<div class="max-w-2xl mx-auto p-6">
  <h1 class="text-2xl font-bold text-pub-gold mb-6">Settings</h1>

  {#if loading}
    <p class="text-pub-muted">Loading...</p>
  {:else}
    <div class="flex gap-2 mb-6 border-b border-pub-muted pb-2">
      <button
        type="button"
        class="px-4 py-2 rounded-lg {activeTab === 'account' ? 'bg-pub-gold text-pub-darker font-semibold' : 'bg-pub-dark text-pub-muted hover:text-pub-gold'}"
        onclick={() => (activeTab = 'account')}
      >
        Account
      </button>
      <button
        type="button"
        class="px-4 py-2 rounded-lg {activeTab === 'content_filters' ? 'bg-pub-gold text-pub-darker font-semibold' : 'bg-pub-dark text-pub-muted hover:text-pub-gold'}"
        onclick={() => (activeTab = 'content_filters')}
      >
        Content filters
      </button>
      <button
        type="button"
        class="px-4 py-2 rounded-lg {activeTab === 'deployment' ? 'bg-pub-gold text-pub-darker font-semibold' : 'bg-pub-dark text-pub-muted hover:text-pub-gold'}"
        onclick={() => (activeTab = 'deployment')}
      >
        Deployment
      </button>
    </div>

    <form
      class="space-y-6"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {#if activeTab === 'account'}
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
      {/if}

      {#if activeTab === 'content_filters'}
      <div>
        <h2 class="text-lg font-semibold text-pub-gold mb-3">Content filters</h2>
        <div class="space-y-4">
          <div>
            <label for="settings-profanity-filter" class="block text-sm text-pub-muted mb-1"
              >Profanity filter</label
            >
            <select
              id="settings-profanity-filter"
              bind:value={profanityFilterMode}
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
            >
              <option value="off">Off</option>
              <option value="names">Names only</option>
              <option value="public_text">Names + public text</option>
              <option value="strict">Strict</option>
            </select>
            <p class="mt-1 text-xs text-pub-muted">Names only = block offensive names. Public text = also hide inappropriate open-ended and word cloud answers from display. Strict = also filter fill-in-the-blank answers.</p>
          </div>
          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={customKeywordFilterEnabled}
                class="rounded"
              />
              <span class="text-sm text-pub-muted">Enable custom keyword filter</span>
            </label>
            <p class="mt-1 text-xs text-pub-muted">Custom terms always apply to names.</p>
            <p class="mt-0.5 text-xs text-pub-muted">For answers, they apply only on answer types currently covered by the profanity filter mode.</p>
            <label for="settings-custom-blocked-terms" class="block text-sm text-pub-muted mt-2 mb-1"
              >Blocked terms (one per line)</label
            >
            <textarea
              id="settings-custom-blocked-terms"
              bind:value={customBlockedTermsText}
              placeholder="67&#10;skibidi"
              rows={6}
              class="w-full bg-pub-dark border border-pub-muted rounded-lg px-4 py-2 font-mono text-sm"
            ></textarea>
            <p class="mt-1 text-xs text-pub-muted">Token-only matching (no phrases, no fuzzy matching, no regex in v1). Max 100 terms, 50 chars each.</p>
          </div>
        </div>
      </div>
      {/if}

      {#if activeTab === 'deployment'}
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
      {/if}

      <p class="text-xs text-pub-muted">Session auth is used for saving. Password required only when changing username or password.</p>
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
