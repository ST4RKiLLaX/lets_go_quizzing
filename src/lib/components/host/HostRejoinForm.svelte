<script lang="ts">
  export let hostRejoinUsername = '';
  export let hostRejoinPassword = '';
  export let onJoin: (username: string, password: string) => void;
</script>

<div class="bg-pub-darker rounded-lg p-4 sm:p-6">
  <p class="text-pub-muted mb-4">Re-enter username and password to join host view</p>
  <form
    class="flex flex-col gap-2"
    onsubmit={(e) => { e.preventDefault(); onJoin(hostRejoinUsername, hostRejoinPassword); }}
  >
    <input
      name="username"
      type="text"
      bind:value={hostRejoinUsername}
      autocomplete="username"
      placeholder="Username"
      class="flex-1 bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
    />
    <input
      name="current-password"
      type="password"
      bind:value={hostRejoinPassword}
      autocomplete="current-password"
      placeholder="Password"
      class="flex-1 bg-pub-dark border border-pub-muted rounded-lg px-4 py-2"
    />
    <button type="submit" class="px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90">
      Join
    </button>
  </form>
</div>
