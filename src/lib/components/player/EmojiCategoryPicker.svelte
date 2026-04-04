<script lang="ts">
  import { EMOJI_CATEGORIES } from '$lib/player/emoji-options.js';

  /** Currently selected emoji. */
  export let selected: string = '😀';

  /** Set of emoji strings that are taken by other connected players. */
  export let unavailable: Set<string> = new Set();

  /**
   * compact  — h-10 text-xl  (join-request / denied-retry forms)
   * comfortable — h-12 text-2xl  (lobby register / settings modal)
   */
  export let density: 'compact' | 'comfortable' = 'comfortable';

  /** Tailwind max-height class for the scroll container. */
  export let scrollClass: string = 'max-h-56';

  /** Called when the user picks an emoji. */
  export let onPick: (emoji: string) => void = () => {};
</script>

<div
  class="overflow-y-auto overflow-x-hidden p-1 {scrollClass}"
  role="group"
  aria-label="Pick an emoji"
  style="scrollbar-width: thin;"
>
  {#each EMOJI_CATEGORIES as category, i}
    <p class="text-xs font-medium text-pub-muted mb-1 {i > 0 ? 'mt-3' : ''}">{category.label}</p>
    <div class="grid grid-cols-6 sm:grid-cols-8 gap-2">
      {#each category.emojis as e}
        {@const isUnavailable = unavailable.has(e)}
        <button
          type="button"
          class="relative w-full leading-none rounded flex items-center justify-center
            {density === 'compact' ? 'h-10 text-xl' : 'h-12 text-2xl'}
            {isUnavailable
              ? 'bg-pub-dark opacity-45 cursor-not-allowed'
              : selected === e
                ? 'bg-pub-accent ring-2 ring-pub-gold'
                : 'bg-pub-dark hover:bg-pub-darker'}"
          disabled={isUnavailable}
          onclick={() => { if (!isUnavailable) onPick(e); }}
        >
          {e}
          {#if isUnavailable}
            <span class="absolute inset-0 flex items-center justify-center text-base font-extrabold text-red-300 pointer-events-none">✕</span>
          {/if}
        </button>
      {/each}
    </div>
  {/each}
</div>
