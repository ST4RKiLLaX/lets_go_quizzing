<script lang="ts">
  export let secondsRemaining = 0;
  export let totalSeconds = 30;
  export let size = 35;

  const strokeWidth = 5;

  $: safeTotal = Math.max(1, totalSeconds);
  $: safeRemaining = Math.max(0, secondsRemaining);
  $: radius = (size - strokeWidth) / 2;
  $: circumference = 2 * Math.PI * radius;
  $: progress = Math.min(1, safeRemaining / safeTotal);
  $: dashOffset = circumference * (1 - progress);
  $: labelFontSizePx = Math.max(14, Math.round(size * 0.32));
</script>

<div class="relative shrink-0" style={`width:${size}px; height:${size}px;`}>
  <svg
    width={size}
    height={size}
    viewBox={`0 0 ${size} ${size}`}
    aria-label={`Timer: ${safeRemaining} seconds remaining`}
    role="img"
  >
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      class="text-pub-muted/30"
      stroke="currentColor"
      stroke-width={strokeWidth}
    />
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      class="text-pub-gold"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashOffset}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
    />
  </svg>
  <div
    class="absolute inset-0 flex items-center justify-center text-pub-gold font-mono font-bold leading-none"
    style={`font-size:${labelFontSizePx}px;`}
  >
    {safeRemaining}
  </div>
</div>
