<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let mode: 'choose' | 'host' | 'play' = 'choose';
  let quizFilename = '';
  let roomId = '';
  $: quizzes = $page.data.quizzes ?? [];
  $: if (quizzes.length > 0 && !quizFilename) quizFilename = quizzes[0];

  function startAsHost() {
    mode = 'host';
  }

  function startAsPlayer() {
    mode = 'play';
  }

  function goToHost() {
    if (!quizFilename) return;
    goto(`/host/create?quiz=${encodeURIComponent(quizFilename)}`);
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
  <a href="/creator" class="mb-6 text-pub-muted hover:text-white text-sm">Create or edit quizzes →</a>

  {#if mode === 'choose'}
    <div class="flex gap-4">
      <button
        class="px-6 py-3 bg-pub-accent rounded-lg font-medium hover:opacity-90"
        on:click={startAsHost}
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
      <button
        class="w-full px-6 py-3 bg-pub-accent rounded-lg font-medium hover:opacity-90"
        on:click={goToHost}
      >
        Create Room
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
