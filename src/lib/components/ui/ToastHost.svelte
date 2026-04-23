<script lang="ts">
  import { tick, onDestroy } from 'svelte';
  import { toasts, type Toast as ToastType } from '$lib/stores/toasts';
  import Toast from './Toast.svelte';

  let politeAnnouncement = '';
  let assertiveAnnouncement = '';
  const announced = new Set<string>();

  type Level = 'polite' | 'assertive';
  type QueueItem = { id: string; text: string };
  const queues: Record<Level, QueueItem[]> = { polite: [], assertive: [] };
  const draining: Record<Level, boolean> = { polite: false, assertive: false };

  let destroyed = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const HOLD_MS = 120;

  let currentList: ToastType[] = [];

  function hold(ms: number) {
    return new Promise<void>((resolve) => {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        resolve();
      }, ms);
    });
  }

  async function drain(level: Level) {
    if (draining[level]) return;
    draining[level] = true;
    try {
      while (!destroyed && queues[level].length > 0) {
        const item = queues[level].shift() as QueueItem;
        if (!currentList.some((t) => t.id === item.id)) continue;
        if (level === 'assertive') assertiveAnnouncement = '';
        else politeAnnouncement = '';
        await tick();
        if (destroyed) return;
        if (level === 'assertive') assertiveAnnouncement = item.text;
        else politeAnnouncement = item.text;
        await hold(HOLD_MS);
        if (destroyed) return;
      }
    } finally {
      draining[level] = false;
    }
  }

  function enqueue(level: Level, id: string, text: string) {
    queues[level].push({ id, text });
    void drain(level);
  }

  function flushQueues() {
    queues.polite.length = 0;
    queues.assertive.length = 0;
  }

  $: {
    currentList = $toasts;
    for (const t of currentList) {
      if (announced.has(t.id)) continue;
      announced.add(t.id);
      const text = (t.title ? t.title + ': ' : '') + t.message;
      enqueue(t.variant === 'error' ? 'assertive' : 'polite', t.id, text);
    }
    for (const id of [...announced]) {
      if (!currentList.some((t) => t.id === id)) {
        announced.delete(id);
        queues.polite = queues.polite.filter((q) => q.id !== id);
        queues.assertive = queues.assertive.filter((q) => q.id !== id);
      }
    }
    if (currentList.length === 0) flushQueues();
  }

  onDestroy(() => {
    destroyed = true;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    flushQueues();
  });
</script>

<div
  class="toast-host fixed top-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
  data-testid="toast-host"
>
  {#each $toasts as t (t.id)}
    <div class="pointer-events-auto">
      <Toast toast={t} />
    </div>
  {/each}
</div>

<div class="sr-only" aria-live="polite" aria-atomic="true">{politeAnnouncement}</div>
<div class="sr-only" aria-live="assertive" aria-atomic="true">{assertiveAnnouncement}</div>
