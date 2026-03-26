<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { get } from 'svelte/store';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import { hostQuizLiveStore } from '$lib/stores/host-quiz-live.js';
  import PrizeTierEditor from '$lib/components/prizes/PrizeTierEditor.svelte';
  import { toPrizeOption } from '$lib/prizes/options.js';
  import { buildDefaultRoomPrizeConfig } from '$lib/prizes/tiers.js';
  import type { PrizeDefinition, PrizeTier } from '$lib/types/prizes.js';

  type Tab = 'account' | 'content_filters' | 'deployment' | 'email' | 'prizes';
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
  let prizesEnabled = false;
  let prizeEmailEnabled = false;
  let prizeEmailSmtpHost = '';
  let prizeEmailSmtpPort = 587;
  let prizeEmailSmtpSecure = false;
  let prizeEmailSmtpUsername = '';
  let prizeEmailFromEmail = '';
  let prizeEmailFromName = '';
  let prizeEmailSmtpPassword = '';
  let prizeEmailSmtpPasswordConfigured = false;
  let prizeEmailAvailableNow = false;
  let clearPrizeEmailSmtpPassword = false;
  let testingPrizeEmailConnection = false;
  let prizeEmailTestMessage = '';
  let prizeEmailTestStatus: 'idle' | 'success' | 'error' = 'idle';
  let defaultRoomPrizeEnabled = false;
  let defaultRoomPrizeTiers: PrizeTier[] = [];
  let prizes: PrizeDefinition[] = [];
  let newPrizeName = '';
  let newPrizeUrl = '';
  let newPrizeLimit = 1;
  let newPrizeExpirationDate = '';
  let newPrizeNotes = '';
  let loadingPrizes = false;
  let prizeError = '';
  let showAddPrizeModal = false;
  let editingPrizeIds: string[] = [];
  let error = '';
  let success = '';
  let loading = true;
  let saving = false;
  let prizeToggleSaving = false;

  function isPrizeSelectable(prize: PrizeDefinition): boolean {
    return prize.active && new Date(`${prize.expirationDate}T23:59:59.999Z`).getTime() >= Date.now();
  }

  function formatCreatedAt(createdAt: number): string {
    return new Date(createdAt).toLocaleString();
  }

  function getClaimedBadgeClass(prize: PrizeDefinition): string {
    const limit = Math.max(1, Number(prize.limit) || 1);
    const remainingRatio = Math.max(0, limit - (Number(prize.usage) || 0)) / limit;
    if (remainingRatio < 0.1) {
      return 'border-red-500/50 text-red-300 bg-red-500/10';
    }
    if (remainingRatio < 0.5) {
      return 'border-amber-500/50 text-amber-300 bg-amber-500/10';
    }
    return 'border-green-500/50 text-green-300 bg-green-500/10';
  }

  function getActiveBadgeClass(prize: PrizeDefinition): string {
    return prize.active
      ? 'border-green-500/50 text-green-300 bg-green-500/10'
      : 'border-red-500/50 text-red-300 bg-red-500/10';
  }

  $: smtpTransportReady =
    prizeEmailSmtpHost.trim().length > 0 &&
    Number.isInteger(Number(prizeEmailSmtpPort)) &&
    Number(prizeEmailSmtpPort) >= 1 &&
    Number(prizeEmailSmtpPort) <= 65535 &&
    prizeEmailSmtpUsername.trim().length > 0 &&
    prizeEmailFromEmail.trim().length > 0 &&
    (clearPrizeEmailSmtpPassword ? false : (prizeEmailSmtpPassword.trim().length > 0 || prizeEmailSmtpPasswordConfigured));

  function getPrizeEmailFeatureRequested(): boolean {
    return prizesEnabled && prizeEmailEnabled;
  }

  function togglePrizeEditing(prizeId: string) {
    if (editingPrizeIds.includes(prizeId)) {
      editingPrizeIds = editingPrizeIds.filter((id) => id !== prizeId);
      return;
    }
    editingPrizeIds = [...editingPrizeIds, prizeId];
  }

  async function loadPrizes() {
    if (!prizesEnabled) {
      prizes = [];
      return;
    }
    loadingPrizes = true;
    prizeError = '';
    try {
      const res = await fetch('/api/prizes', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        prizeError = data.error ?? 'Failed to load prizes';
        return;
      }
      prizes = data.prizes ?? [];
    } catch {
      prizeError = 'Failed to load prizes';
    } finally {
      loadingPrizes = false;
    }
  }

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
      prizesEnabled = data.prizesEnabled ?? false;
      prizeEmailEnabled = data.prizeEmailEnabled ?? false;
      prizeEmailSmtpHost = data.prizeEmailSmtpHost ?? '';
      prizeEmailSmtpPort = data.prizeEmailSmtpPort ?? 587;
      prizeEmailSmtpSecure = data.prizeEmailSmtpSecure ?? false;
      prizeEmailSmtpUsername = data.prizeEmailSmtpUsername ?? '';
      prizeEmailFromEmail = data.prizeEmailFromEmail ?? '';
      prizeEmailFromName = data.prizeEmailFromName ?? '';
      prizeEmailSmtpPassword = '';
      prizeEmailSmtpPasswordConfigured = data.prizeEmailSmtpPasswordConfigured === true;
      prizeEmailAvailableNow = data.prizeEmailAvailableNow === true;
      clearPrizeEmailSmtpPassword = false;
      prizeEmailTestMessage = '';
      prizeEmailTestStatus = 'idle';
      defaultRoomPrizeEnabled = data.defaultRoomPrizeConfig?.enabledByDefault ?? false;
      defaultRoomPrizeTiers = data.defaultRoomPrizeConfig?.tiers ?? [];
      envOverrides = data.envOverrides ?? { origin: false, roomIdLen: false };
      await loadPrizes();
    } catch {
      error = 'Failed to load settings';
    } finally {
      loading = false;
    }
  }

  function buildPrizeSettingsPayload(): Record<string, unknown> {
    return {
      prizesEnabled,
      prizeEmailEnabled: getPrizeEmailFeatureRequested(),
      prizeEmailSmtpHost: prizeEmailSmtpHost.trim(),
      prizeEmailSmtpPort: Number(prizeEmailSmtpPort) || 587,
      prizeEmailSmtpSecure,
      prizeEmailSmtpUsername: prizeEmailSmtpUsername.trim(),
      prizeEmailFromEmail: prizeEmailFromEmail.trim(),
      prizeEmailFromName: prizeEmailFromName.trim(),
      defaultRoomPrizeConfig: prizesEnabled ? buildDefaultRoomPrizeConfig(defaultRoomPrizeEnabled, defaultRoomPrizeTiers) : null,
    };
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
        ...buildPrizeSettingsPayload(),
      };
      if (clearPrizeEmailSmtpPassword) {
        body.clearPrizeEmailSmtpPassword = true;
      } else if (prizeEmailSmtpPassword.trim()) {
        body.prizeEmailSmtpPassword = prizeEmailSmtpPassword;
      }
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
      if (clearPrizeEmailSmtpPassword) {
        prizeEmailSmtpPasswordConfigured = false;
      } else if (prizeEmailSmtpPassword.trim()) {
        prizeEmailSmtpPasswordConfigured = true;
      }
      prizeEmailAvailableNow = getPrizeEmailFeatureRequested() && smtpTransportReady;
      prizeEmailSmtpPassword = '';
      clearPrizeEmailSmtpPassword = false;
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

  async function testPrizeEmailConnection() {
    prizeEmailTestMessage = '';
    prizeEmailTestStatus = 'idle';
    testingPrizeEmailConnection = true;
    try {
      const res = await fetch('/api/settings/prize-email-test', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      prizeEmailTestMessage = res.ok ? 'SMTP connection verified.' : (data.error ?? 'SMTP test failed');
      prizeEmailTestStatus = res.ok ? 'success' : 'error';
    } catch {
      prizeEmailTestMessage = 'SMTP test failed';
      prizeEmailTestStatus = 'error';
    } finally {
      testingPrizeEmailConnection = false;
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

  async function savePrizeFeatureToggle() {
    prizeError = '';
    success = '';
    prizeToggleSaving = true;
    const previousPrizesEnabled = !prizesEnabled;
    const previousPrizeEmailEnabled = prizeEmailEnabled;
    if (!prizesEnabled) {
      prizeEmailEnabled = false;
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPrizeSettingsPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        prizeError = data.error ?? 'Failed to save prize feature setting';
        prizesEnabled = previousPrizesEnabled;
        prizeEmailEnabled = previousPrizeEmailEnabled;
        return;
      }
      success = 'Prize feature setting saved.';
      prizeEmailAvailableNow = getPrizeEmailFeatureRequested() && smtpTransportReady;
      await invalidateAll();
      await loadPrizes();
    } catch {
      prizeError = 'Failed to save prize feature setting';
      prizesEnabled = previousPrizesEnabled;
      prizeEmailEnabled = previousPrizeEmailEnabled;
    } finally {
      prizeToggleSaving = false;
    }
  }

  async function createPrize() {
    prizeError = '';
    if (!newPrizeExpirationDate) {
      prizeError = 'Expiration date is required';
      return;
    }
    try {
      const res = await fetch('/api/prizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newPrizeName,
          url: newPrizeUrl,
          limit: newPrizeLimit,
          expirationDate: newPrizeExpirationDate,
          notes: newPrizeNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        prizeError = data.error ?? 'Failed to create prize';
        return;
      }
      newPrizeName = '';
      newPrizeUrl = '';
      newPrizeLimit = 1;
      newPrizeExpirationDate = '';
      newPrizeNotes = '';
      showAddPrizeModal = false;
      await loadPrizes();
    } catch {
      prizeError = 'Failed to create prize';
    }
  }

  function openAddPrizeModal() {
    prizeError = '';
    showAddPrizeModal = true;
  }

  function closeAddPrizeModal() {
    showAddPrizeModal = false;
  }

  async function savePrize(prize: PrizeDefinition) {
    prizeError = '';
    try {
      const res = await fetch(`/api/prizes/${encodeURIComponent(prize.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(prize),
      });
      const data = await res.json();
      if (!res.ok) {
        prizeError = data.error ?? 'Failed to save prize';
        return;
      }
      editingPrizeIds = editingPrizeIds.filter((id) => id !== prize.id);
      await loadPrizes();
    } catch {
      prizeError = 'Failed to save prize';
    }
  }

  async function deletePrize(prizeId: string) {
    if (!confirm(`Delete prize ${prizeId}?`)) return;
    prizeError = '';
    try {
      const res = await fetch(`/api/prizes/${encodeURIComponent(prizeId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        prizeError = data.error ?? 'Failed to delete prize';
        return;
      }
      await loadPrizes();
    } catch {
      prizeError = 'Failed to delete prize';
    }
  }
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
      <button
        type="button"
        class="px-4 py-2 rounded-lg {activeTab === 'email' ? 'bg-pub-gold text-pub-darker font-semibold' : 'bg-pub-dark text-pub-muted hover:text-pub-gold'}"
        onclick={() => (activeTab = 'email')}
      >
        Email
      </button>
      <button
        type="button"
        class="px-4 py-2 rounded-lg {activeTab === 'prizes' ? 'bg-pub-gold text-pub-darker font-semibold' : 'bg-pub-dark text-pub-muted hover:text-pub-gold'}"
        onclick={() => (activeTab = 'prizes')}
      >
        Prizes
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

      {#if activeTab === 'email'}
      <div class="space-y-6">
        <div class="rounded-lg border border-pub-muted bg-pub-darker p-4 space-y-4">
          <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-pub-gold">SMTP</h2>
              <p class="text-sm text-pub-muted">
                Configure the shared outgoing email account used by the app.
              </p>
              <p class="text-sm text-pub-muted">
                Readable transport settings are stored in app config. The SMTP password is stored separately and never shown again.
              </p>
            </div>
            <span class="inline-flex items-center rounded-full border border-pub-muted px-3 py-1 text-xs text-pub-muted">
              {#if prizeEmailAvailableNow}
                Available now
              {:else if smtpTransportReady}
                Config saved, feature off
              {:else}
                Incomplete
              {/if}
            </span>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">SMTP host</span>
              <input bind:value={prizeEmailSmtpHost} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" placeholder="smtp.example.com" />
            </label>
            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">SMTP port</span>
              <input bind:value={prizeEmailSmtpPort} type="number" min={1} max={65535} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" />
            </label>
            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">SMTP username</span>
              <input bind:value={prizeEmailSmtpUsername} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" placeholder="mailer@example.com" />
            </label>
            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">From email</span>
              <input bind:value={prizeEmailFromEmail} type="email" class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" placeholder="noreply@example.com" />
            </label>
            <label class="block text-sm md:col-span-2">
              <span class="mb-1 block text-pub-muted">From name</span>
              <input bind:value={prizeEmailFromName} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" placeholder="Let's Go Quizzing" />
            </label>
            <label class="flex items-center gap-2 text-sm text-pub-muted">
              <input type="checkbox" bind:checked={prizeEmailSmtpSecure} class="rounded" />
              Use secure SMTP / TLS
            </label>
          </div>

          <div class="rounded-lg border border-pub-muted/50 bg-pub-dark p-4 space-y-3">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-sm font-medium text-pub-gold">SMTP password</p>
                <p class="text-xs text-pub-muted">
                  Status:
                  {#if clearPrizeEmailSmtpPassword}
                    will be cleared on save
                  {:else if prizeEmailSmtpPassword.trim()}
                    replacement ready
                  {:else if prizeEmailSmtpPasswordConfigured}
                    configured
                  {:else}
                    not configured
                  {/if}
                </p>
              </div>
            </div>
            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">Replace password</span>
              <input
                bind:value={prizeEmailSmtpPassword}
                type="password"
                class="w-full rounded-lg border border-pub-muted bg-pub-darker px-3 py-2"
                placeholder={prizeEmailSmtpPasswordConfigured ? 'Leave blank to keep current password' : 'Enter SMTP password'}
                disabled={clearPrizeEmailSmtpPassword}
              />
            </label>
            <label class="flex items-center gap-2 text-sm text-pub-muted">
              <input type="checkbox" bind:checked={clearPrizeEmailSmtpPassword} class="rounded" disabled={prizeEmailSmtpPassword.trim().length > 0} />
              Clear stored password on next save
            </label>
          </div>

          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p class="text-xs text-pub-muted">
              Save first, then run a connection test. The test verifies SMTP connect/auth and does not send a real email.
            </p>
            <button
              type="button"
              class="rounded-lg border border-pub-muted px-4 py-2 text-sm hover:bg-pub-dark disabled:opacity-50"
              onclick={testPrizeEmailConnection}
              disabled={testingPrizeEmailConnection || !smtpTransportReady}
            >
              {testingPrizeEmailConnection ? 'Testing...' : 'Test connection'}
            </button>
          </div>
          {#if prizeEmailTestMessage}
            <p class="text-sm {prizeEmailTestStatus === 'success' ? 'text-green-400' : 'text-red-400'}">
              {prizeEmailTestMessage}
            </p>
          {/if}
        </div>
      </div>
      {/if}

      {#if activeTab === 'prizes'}
      <div class="space-y-6">
        <div>
          <h2 class="text-lg font-semibold text-pub-gold mb-3">Prize feature</h2>
          <div class="space-y-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={prizesEnabled}
                class="rounded"
                disabled={prizeToggleSaving}
                onchange={() => void savePrizeFeatureToggle()}
              />
              <span class="text-sm text-pub-muted">Enable prize feature</span>
            </label>
            {#if prizeToggleSaving}
              <p class="text-xs text-pub-muted">Saving prize feature setting...</p>
            {/if}
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={prizeEmailEnabled} class="rounded" disabled={!prizesEnabled} />
              <span class="text-sm text-pub-muted">Enable one-time prize email delivery</span>
            </label>
            <p class="text-xs text-pub-muted">
              When disabled, prize controls are hidden from room creation, host flow, and players.
            </p>
          </div>
        </div>

        {#if prizesEnabled}
          <div class="rounded-lg border border-pub-muted bg-pub-darker p-4">
            <PrizeTierEditor
              bind:enabled={defaultRoomPrizeEnabled}
              bind:tiers={defaultRoomPrizeTiers}
              availablePrizes={prizes.filter((prize) => isPrizeSelectable(prize)).map(toPrizeOption)}
              title="Default room prize setup"
              subtitle="Preload these tiers in room creation. Hosts can still change them per room."
              emptyMessage="No default prize tiers configured."
              enabledLabel="Enable by default"
            />
          </div>

          <div class="space-y-4">
            <div>
              <h2 class="text-lg font-semibold text-pub-gold mb-3">Prize pool</h2>
              <p class="text-sm text-pub-muted">Manage the prize links available for room prize tiers.</p>
            </div>

            <div>
              <button
                type="button"
                class="rounded-lg bg-pub-accent px-4 py-2 font-medium hover:opacity-90"
                onclick={openAddPrizeModal}
              >
                Add prize
              </button>
            </div>

            {#if loadingPrizes}
              <p class="text-sm text-pub-muted">Loading prizes...</p>
            {:else if prizes.length === 0}
              <p class="text-sm text-pub-muted">No prizes yet.</p>
            {:else}
              <div class="space-y-4">
                {#each prizes as prize, index}
                  <div class="rounded-lg border p-4 space-y-3 {editingPrizeIds.includes(prize.id) ? 'border-amber-400 bg-pub-dark' : 'border-pub-muted bg-pub-darker'}">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-base font-semibold text-pub-gold truncate">{prize.name}</p>
                        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-pub-muted">
                          <span>Created: {formatCreatedAt(prize.createdAt)}</span>
                          <span class={`rounded-full border px-2 py-0.5 ${getClaimedBadgeClass(prize)}`}>
                            Claimed: {prize.usage}
                          </span>
                          <span class={`rounded-full border px-2 py-0.5 ${getActiveBadgeClass(prize)}`}>
                            {prize.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {#if editingPrizeIds.includes(prize.id)}
                          <span class="mt-2 inline-block text-xs font-medium text-amber-300">Editing</span>
                        {/if}
                      </div>
                      <button
                        type="button"
                        class="inline-flex items-center justify-center p-2 rounded-lg text-amber-400 hover:bg-pub-dark hover:text-amber-300 disabled:opacity-50"
                        title={editingPrizeIds.includes(prize.id) ? 'Cancel editing' : 'Edit prize'}
                        aria-label={editingPrizeIds.includes(prize.id) ? `Cancel editing ${prize.name}` : `Edit ${prize.name}`}
                        onclick={() => togglePrizeEditing(prize.id)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="block text-sm md:col-span-2">
                        <span class="mb-1 block text-pub-muted">Prize URL</span>
                        <input bind:value={prizes[index].url} disabled={!editingPrizeIds.includes(prize.id)} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </label>
                      <label class="block text-sm">
                        <span class="mb-1 block text-pub-muted">Quantity</span>
                        <input bind:value={prizes[index].limit} type="number" min={1} disabled={!editingPrizeIds.includes(prize.id)} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </label>
                      <label class="block text-sm">
                        <span class="mb-1 block text-pub-muted">Expiration date</span>
                        <input bind:value={prizes[index].expirationDate} type="date" disabled={!editingPrizeIds.includes(prize.id)} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </label>
                      <label class="block text-sm md:col-span-2">
                        <span class="mb-1 block text-pub-muted">Notes</span>
                        <input bind:value={prizes[index].notes} disabled={!editingPrizeIds.includes(prize.id)} class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2 disabled:opacity-70 disabled:cursor-not-allowed" placeholder="Notes" />
                      </label>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label class="flex items-center gap-2 text-sm text-pub-muted">
                        <input type="checkbox" bind:checked={prizes[index].active} class="rounded" disabled={!editingPrizeIds.includes(prize.id)} />
                        Active
                      </label>
                      <div class="flex flex-wrap items-center gap-3">
                        <button type="button" class="rounded-lg bg-pub-accent px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50" onclick={() => savePrize(prizes[index])} disabled={!editingPrizeIds.includes(prize.id)}>
                          Save
                        </button>
                        <button type="button" class="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10" onclick={() => deletePrize(prize.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      {/if}

      <p class="text-xs text-pub-muted">Session auth is used for saving. Password required only when changing username or password.</p>
      {#if error}
        <p class="text-sm text-red-400">{error}</p>
      {/if}
      {#if prizeError}
        <p class="text-sm text-red-400">{prizeError}</p>
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

<ConfirmModal
  open={showAddPrizeModal}
  title="Add prize"
  titleId="add-prize-modal-title"
  cancelLabel="Cancel"
  confirmLabel="Create prize"
  confirmButtonClass="bg-pub-accent text-white"
  onClose={closeAddPrizeModal}
  onConfirm={createPrize}
>
  <div class="mb-4 space-y-4">
    <div class="grid gap-3 md:grid-cols-2">
      <label class="block text-sm">
        <span class="mb-1 block text-pub-muted">Prize name</span>
        <input bind:value={newPrizeName} placeholder="Prize name" class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" />
      </label>
      <label class="block text-sm md:col-span-2">
        <span class="mb-1 block text-pub-muted">Prize URL</span>
        <input bind:value={newPrizeUrl} placeholder="https://example.com/course" class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-pub-muted">Quantity</span>
        <input bind:value={newPrizeLimit} type="number" min={1} placeholder="Quantity" class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-pub-muted">Expiration date</span>
        <input bind:value={newPrizeExpirationDate} type="date" required class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" />
      </label>
      <label class="block text-sm md:col-span-2">
        <span class="mb-1 block text-pub-muted">Notes</span>
        <input bind:value={newPrizeNotes} placeholder="Notes (optional)" class="w-full rounded-lg border border-pub-muted bg-pub-dark px-3 py-2" />
      </label>
    </div>
    {#if prizeError && showAddPrizeModal}
      <p class="text-sm text-red-400">{prizeError}</p>
    {/if}
  </div>
</ConfirmModal>
