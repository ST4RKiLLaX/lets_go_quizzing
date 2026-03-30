<script lang="ts">
  import { formatOptionLabel } from '$lib/utils/option-label.js';

  export let options: string[];
  export let optionLabelStyle: 'letters' | 'numbers';
  /** When true, show submission counts (reveal / host live with tallies) */
  export let showCounts = false;
  export let counts: Map<number, number> = new Map();
  export let itemRoundedClass = 'rounded-lg';
  export let optionIndices: number[] = options.map((_, i) => i);
</script>

<ul class="space-y-2">
  {#each optionIndices as optionIndex, i}
    <li class="px-4 py-2 bg-pub-dark {itemRoundedClass}">
      <div class="flex items-center gap-2">
        <span
          class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
        >
          {formatOptionLabel(i, optionLabelStyle)}
        </span>
        <span class="flex-1 break-words">{options[optionIndex]}</span>
        {#if showCounts}
          <span class="text-pub-gold font-semibold">{counts.get(optionIndex) ?? 0}</span>
        {/if}
      </div>
    </li>
  {/each}
</ul>
