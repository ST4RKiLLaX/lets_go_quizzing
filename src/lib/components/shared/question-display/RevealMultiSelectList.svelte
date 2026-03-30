<script lang="ts">
  import { formatOptionLabel } from '$lib/utils/option-label.js';

  export let options: string[];
  /** Indices of correct options */
  export let correctIndices: number[];
  export let counts: Map<number, number>;
  export let optionLabelStyle: 'letters' | 'numbers';
  export let itemRoundedClass = 'rounded-lg';
  export let optionIndices: number[] = options.map((_, i) => i);
</script>

<ul class="space-y-2">
  {#each optionIndices as optionIndex, i}
    <li
      class="px-4 py-2 bg-pub-dark {itemRoundedClass} {correctIndices.includes(optionIndex)
        ? 'ring-2 ring-green-500'
        : 'opacity-60'}"
    >
      <div class="flex items-center gap-2">
        <span
          class="w-7 h-7 rounded-full bg-pub-gold text-sm font-extrabold text-pub-darker shrink-0 flex items-center justify-center self-center leading-none"
        >
          {formatOptionLabel(i, optionLabelStyle)}
        </span>
        <span class="flex-1 break-words">
          {options[optionIndex]} {#if correctIndices.includes(optionIndex)}(correct){/if}
        </span>
        <span class="text-pub-gold font-semibold">{counts.get(optionIndex) ?? 0}</span>
      </div>
    </li>
  {/each}
</ul>
