<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { socketStore } from '$lib/stores/socket.js';
  import { onMount } from 'svelte';

  const quizFilename = $page.url.searchParams.get('quiz') ?? '';

  onMount(() => {
    if (!quizFilename) {
      goto('/');
      return;
    }
    const socket = socketStore.connect();
    socket.emit('host:create', { quizFilename }, (ack: { roomId?: string; error?: string }) => {
      if (ack?.roomId) {
        goto(`/host/${ack.roomId}`);
      } else {
        goto('/');
      }
    });
  });
</script>

<div class="min-h-screen flex items-center justify-center">
  <p class="text-pub-muted">Creating room...</p>
</div>
