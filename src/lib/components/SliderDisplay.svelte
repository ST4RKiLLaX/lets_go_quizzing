<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { onDestroy } from 'svelte';

  export let min: number;
  export let max: number;
  export let step: number;
  export let mode: 'idle' | 'reveal' = 'idle';
  export let value: number | undefined = undefined;
  export let submissions: Array<{ emoji: string; answerNumber: number; isWrong?: boolean }> = [];
  export let showCorrect = false;

  const STROKE_PX = 2;
  const GREEN = '#15803d';
  const RED = '#b91c1c';

  $: range = max - min || 1;
  $: percent = (v: number) => (Math.max(min, Math.min(max, v)) - min) / range;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const idleValue = tweened(min, { duration: 2000 });

  function pickRandomTarget(): number {
    const steps = Math.round(range / step) || 1;
    const idx = Math.floor(Math.random() * (steps + 1));
    return min + idx * step;
  }

  function formatForStep(val: number): string {
    const snapped = Math.round(val / step) * step;
    const decimals = step >= 1 ? 0 : Math.min(2, (step.toString().split('.')[1]?.length ?? 2));
    return (Math.round(snapped * Math.pow(10, decimals)) / Math.pow(10, decimals)).toString();
  }

  function scheduleNext() {
    const target = pickRandomTarget();
    idleValue.set(target);
  }

  $: if (mode === 'idle') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    idleValue.set(min);
    intervalId = setInterval(scheduleNext, 3500);
    scheduleNext();
  } else if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });
</script>

<div class="px-4 py-4 bg-pub-dark rounded-lg">
  <div class="flex items-center justify-between gap-4 mb-3">
    <span class="text-sm text-pub-muted">{min}</span>
    {#if mode === 'idle'}
      <span class="text-lg font-semibold text-pub-gold">{formatForStep($idleValue)}</span>
    {:else if mode === 'reveal' && value != null}
      <span class="text-lg font-semibold text-pub-gold">Correct: {value}</span>
    {:else}
      <span class="text-lg font-semibold text-pub-gold"></span>
    {/if}
    <span class="text-sm text-pub-muted">{max}</span>
  </div>

  <div class="relative w-full h-8">
    {#if mode === 'idle'}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={$idleValue}
        disabled
        class="w-full accent-pub-gold pointer-events-none"
      />
    {:else}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        disabled
        class="w-full accent-pub-gold opacity-50"
      />
      {#if showCorrect && value != null}
        <div
          class="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-green-500 rounded pointer-events-none"
          style="left: {(percent(value) * 100)}%; transform: translate(-50%, -50%);"
          title="Correct"
        ></div>
      {/if}
      {#each submissions as sub}
        {@const pct = percent(sub.answerNumber)}
        {@const strokeColor = sub.isWrong ? RED : GREEN}
        {@const stroke = [
          `${STROKE_PX}px ${STROKE_PX}px 0 ${strokeColor}`,
          `-${STROKE_PX}px ${STROKE_PX}px 0 ${strokeColor}`,
          `${STROKE_PX}px -${STROKE_PX}px 0 ${strokeColor}`,
          `-${STROKE_PX}px -${STROKE_PX}px 0 ${strokeColor}`,
          `${STROKE_PX}px 0 0 ${strokeColor}`,
          `-${STROKE_PX}px 0 0 ${strokeColor}`,
          `0 ${STROKE_PX}px 0 ${strokeColor}`,
          `0 -${STROKE_PX}px 0 ${strokeColor}`,
        ].join(', ')}
        <div
          class="absolute flex items-center justify-center text-2xl pointer-events-none -top-2"
          style="left: {(pct * 100)}%; transform: translate(-50%, -50%); text-shadow: {stroke};"
          title={sub.answerNumber}
        >
          {sub.emoji}
        </div>
      {/each}
    {/if}
  </div>
</div>
