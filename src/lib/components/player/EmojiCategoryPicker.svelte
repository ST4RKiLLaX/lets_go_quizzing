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

  let scrollContainer: HTMLDivElement | null = null;

  const scrollToCategory = (categoryId: string): void => {
    if (!scrollContainer) return;
    const categorySection = scrollContainer.querySelector<HTMLElement>(
      `[data-emoji-category="${categoryId}"]`
    );
    if (!categorySection) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const sectionRect = categorySection.getBoundingClientRect();
    const targetTop = scrollContainer.scrollTop + (sectionRect.top - containerRect.top) - 4;

    scrollContainer.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: 'smooth'
    });
  };
</script>

<div class="space-y-2">
  <div class="overflow-x-auto overflow-y-hidden pb-1" style="scrollbar-width: thin;">
    <div class="inline-flex items-center gap-1 min-w-full">
      {#each EMOJI_CATEGORIES as category}
        <button
          type="button"
          class="shrink-0 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap bg-pub-dark text-pub-muted hover:bg-pub-darker hover:text-pub-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pub-gold"
          aria-label={`Jump to ${category.label}`}
          onclick={() => scrollToCategory(category.id)}
        >
          {category.label}
        </button>
      {/each}
    </div>
  </div>

  <div
    bind:this={scrollContainer}
    class="overflow-y-auto overflow-x-hidden p-1 {scrollClass}"
    role="group"
    aria-label="Pick an emoji"
    style="scrollbar-width: thin;"
  >
    {#each EMOJI_CATEGORIES as category, i}
      <section
        id={`emoji-category-${category.id}`}
        data-emoji-category={category.id}
        aria-label={category.label}
      >
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
      </section>
    {/each}
  </div>
</div>
