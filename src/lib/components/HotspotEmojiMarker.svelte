<script lang="ts">
  export let x: number;
  export let y: number;
  export let emoji: string;
  export let name: string;
  export let isWrong: boolean;
  export let showCorrectness = true;

  const STROKE_PX = 2;
  const GREEN = '#15803d'; // green-700
  const RED = '#b91c1c'; // red-700
  const NEUTRAL = '#6b7280'; // gray-500

  $: strokeColor = !showCorrectness ? NEUTRAL : isWrong ? RED : GREEN;
  $: stroke = [
    `${STROKE_PX}px ${STROKE_PX}px 0 ${strokeColor}`,
    `-${STROKE_PX}px ${STROKE_PX}px 0 ${strokeColor}`,
    `${STROKE_PX}px -${STROKE_PX}px 0 ${strokeColor}`,
    `-${STROKE_PX}px -${STROKE_PX}px 0 ${strokeColor}`,
    `${STROKE_PX}px 0 0 ${strokeColor}`,
    `-${STROKE_PX}px 0 0 ${strokeColor}`,
    `0 ${STROKE_PX}px 0 ${strokeColor}`,
    `0 -${STROKE_PX}px 0 ${strokeColor}`,
  ].join(', ');
</script>

<div
  class="absolute flex items-center justify-center text-3xl pointer-events-none"
  style="left: {(x * 100)}%; top: {(y * 100)}%; transform: translate(-50%, -50%); text-shadow: {stroke};"
  title={name}
>
  {emoji}
</div>
