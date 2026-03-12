<script lang="ts">
  import { generate } from 'lean-qr';
  import { onDestroy } from 'svelte';

  export let roomId: string;
  export let joinUrl: string;

  let qrCanvas: HTMLCanvasElement | null = null;

  $: if (joinUrl && qrCanvas) {
    generate(joinUrl).toCanvas(qrCanvas, {
      on: [255, 255, 255, 255],
      off: [26, 26, 46, 255],
    });
  }

  onDestroy(() => {
    qrCanvas = null;
  });
</script>

<div class="text-center">
  <h2 class="text-xl font-bold mb-6">Waiting for host to start</h2>
  <p class="text-pub-muted mb-6">Room: <span class="text-pub-gold font-mono">{roomId}</span></p>
  {#if joinUrl}
    <p class="text-lg text-pub-muted mb-4">Scan to join</p>
    <canvas
      bind:this={qrCanvas}
      class="mx-auto rounded-lg min-w-[256px] min-h-[256px] [image-rendering:pixelated]"
    ></canvas>
    <p class="mt-4 text-sm text-pub-muted break-all">
      {joinUrl}
    </p>
  {/if}
</div>
