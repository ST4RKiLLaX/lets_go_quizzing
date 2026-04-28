<script lang="ts">
  export let roomId: string;
  export let playersCount = 0;
</script>

<div class="bg-pub-darker rounded-lg p-6">
  <h2 class="text-xl font-bold mb-4">Waiting for host to start</h2>
  <p class="text-pub-muted">Room: <span class="text-pub-gold font-mono">{roomId}</span></p>
  <p class="text-pub-muted mt-2">Players: {playersCount}</p>
</div>
