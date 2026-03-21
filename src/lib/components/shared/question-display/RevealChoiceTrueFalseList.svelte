<script lang="ts">
  import { formatOptionLabel } from '$lib/utils/option-label.js';

  export let options: string[];
  /** Index of the correct option (true_false: 0 = True, 1 = False when answer is false) */
  export let correctIndex: number;
  export let optionLabelStyle: 'letters' | 'numbers';
  /** Unify with projector (`rounded-lg`) */
  export let itemRoundedClass = 'rounded-lg';
</script>

<ul class="space-y-2">
  {#each options as opt, i}
    <li
      class="px-4 py-2 bg-pub-dark {itemRoundedClass} {correctIndex === i
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
          {opt} {#if correctIndex === i}(correct){/if}
        </span>
      </div>
    </li>
  {/each}
</ul>
