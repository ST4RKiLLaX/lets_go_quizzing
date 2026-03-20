<script lang="ts">
  import { page } from '$app/stores';
  import { hostQuizLiveStore } from '$lib/stores/host-quiz-live.js';

  let showLogoutModal = false;
  let showQuizLiveWarning = false;
  let loggingOut = false;
  $: hostRoomMatch = $page.url.pathname.match(/^\/host\/([^/]+)$/);
  $: projectorRoomId = hostRoomMatch?.[1] ?? '';
  $: showProjectorButton = !!projectorRoomId;
  $: quizLive = $hostQuizLiveStore.live;
  $: hostRoomId = $hostQuizLiveStore.roomId;

  async function confirmLogout() {
    if (loggingOut || quizLive) return;
    loggingOut = true;
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    } finally {
      loggingOut = false;
    }
  }

  function onLogoutClick() {
    if (quizLive) {
      showQuizLiveWarning = true;
    } else {
      showLogoutModal = true;
    }
  }
</script>

<nav
  class="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-8 bg-pub-darker border-b border-pub-muted"
>
  <a href="/" class="text-lg font-bold text-pub-gold hover:opacity-90">Let's Go Quizzing</a>
  <div class="flex items-center gap-2">
    {#if quizLive}
      <button
        type="button"
        class="p-2 rounded-lg text-pub-muted opacity-40 cursor-not-allowed"
        aria-label="Creator (disabled during quiz)"
        disabled
        title="Creator unavailable while quiz is live"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        type="button"
        class="p-2 rounded-lg text-pub-muted opacity-40 cursor-not-allowed"
        aria-label="Settings (disabled during quiz)"
        disabled
        title="Settings unavailable while quiz is live"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>
    {:else}
    <a
      href="/creator"
      class="p-2 rounded-lg text-pub-muted hover:bg-pub-dark hover:text-pub-gold"
      aria-label="Creator"
      title="Creator"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </a>
    <a
      href="/settings"
      class="p-2 rounded-lg text-pub-muted hover:bg-pub-dark hover:text-pub-gold"
      aria-label="Settings"
    >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
    </a>
    {/if}
    {#if showProjectorButton}
      <button
        type="button"
        class="p-2 rounded-lg text-pub-muted hover:bg-pub-dark hover:text-pub-gold"
        aria-label="Open projector"
        title="Open projector"
        on:click={() => window.open(`/projector/${projectorRoomId}`, 'projector-' + projectorRoomId, 'width=1280,height=720,noopener')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </button>
    {/if}
    <button
      type="button"
      class="p-2 rounded-lg text-pub-muted hover:bg-pub-dark hover:text-pub-gold disabled:opacity-50"
      aria-label="Log out"
      on:click={onLogoutClick}
      disabled={loggingOut}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M13 4h3a2 2 0 0 1 2 2v14" />
        <path d="M2 20h3" />
        <path d="M13 20h9" />
        <path d="M10 12v.01" />
        <path d="M13 4.562v11.476a2 2 0 0 1-3.512 1.41L8 13" />
      </svg>
    </button>
  </div>
</nav>

{#if showLogoutModal}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="logout-modal-title">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 id="logout-modal-title" class="text-lg font-semibold text-pub-gold mb-3">Log out?</h2>
      <p class="text-sm text-pub-muted mb-5">
        You will be logged out and will need to enter your username and password again to host games, create quizzes, or access settings.
      </p>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          on:click={() => (showLogoutModal = false)}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 bg-red-600 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          on:click={confirmLogout}
          disabled={loggingOut}
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showQuizLiveWarning}
  <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-live-modal-title">
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 id="quiz-live-modal-title" class="text-lg font-semibold text-pub-gold mb-3">Cannot log out</h2>
      <p class="text-sm text-pub-muted mb-5">
        You must end the quiz before logging out. Go to your host page and click "End Quiz" to finish the session, then you can log out.
      </p>
      <div class="flex justify-end gap-2">
        {#if hostRoomId}
          <a
            href="/host/{hostRoomId}"
            class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 text-center"
            on:click={() => { showQuizLiveWarning = false; }}
          >
            Go to quiz
          </a>
        {/if}
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          on:click={() => (showQuizLiveWarning = false)}
        >
          OK
        </button>
      </div>
    </div>
  </div>
{/if}
