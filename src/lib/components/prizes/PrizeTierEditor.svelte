<script lang="ts">
  import type { PrizeOption, PrizeTier } from '$lib/types/prizes.js';

  export let enabled = false;
  export let tiers: PrizeTier[] = [];
  export let availablePrizes: PrizeOption[] = [];
  export let editable = true;
  export let title = 'Prizes';
  export let subtitle = '';
  export let showSaveDefault = false;
  export let saveAsDefault = false;
  export let emptyMessage = 'No prize tiers configured.';

  function addTier() {
    tiers = [...tiers, { minScore: 0, prizeId: availablePrizes[0]?.id ?? '', label: '' }];
  }

  function updateTier(index: number, updates: Partial<PrizeTier>) {
    tiers = tiers.map((tier, currentIndex) =>
      currentIndex === index ? { ...tier, ...updates } : tier
    );
  }

  function removeTier(index: number) {
    tiers = tiers.filter((_, currentIndex) => currentIndex !== index);
  }

  function getPrizeOptionLabel(prize: PrizeOption): string {
    return prize.remainingQuantity != null ? `${prize.remainingQuantity} remain : ${prize.name}` : prize.name;
  }
</script>

<div class="space-y-4">
  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
    <div class="min-w-0">
      <h3 class="text-lg font-semibold text-pub-gold">{title}</h3>
      {#if subtitle}
        <p class="text-sm text-pub-muted mt-1">{subtitle}</p>
      {/if}
    </div>
    <label class="inline-flex items-center gap-2 text-sm text-pub-muted md:shrink-0">
      <input type="checkbox" bind:checked={enabled} disabled={!editable} class="rounded" />
      Enable for this room
    </label>
  </div>

  {#if enabled}
    <div class="space-y-3">
      {#if tiers.length === 0}
        <p class="text-sm text-pub-muted">{emptyMessage}</p>
      {/if}

      {#each tiers as tier, index}
        <div class="rounded-xl border border-pub-muted bg-pub-dark p-4">
          <div class="grid gap-3 md:grid-cols-[72px_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-end">
            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">Min score</span>
              <input
                type="number"
                min={0}
                value={tier.minScore}
                disabled={!editable}
                class="w-full rounded-lg border border-pub-muted bg-pub-darker px-3 py-2"
                oninput={(event) => updateTier(index, { minScore: Number((event.currentTarget as HTMLInputElement).value) || 0 })}
              />
            </label>

            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">Prize</span>
              <select
                value={tier.prizeId}
                disabled={!editable}
                class="w-full rounded-lg border border-pub-muted bg-pub-darker px-3 py-2"
                onchange={(event) => updateTier(index, { prizeId: (event.currentTarget as HTMLSelectElement).value })}
              >
                <option value="" disabled selected={!tier.prizeId}>Select a prize</option>
                {#each availablePrizes as prize}
                  <option value={prize.id}>{getPrizeOptionLabel(prize)}</option>
                {/each}
              </select>
            </label>

            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">Label (optional)</span>
              <input
                type="text"
                value={tier.label ?? ''}
                disabled={!editable}
                class="w-full rounded-lg border border-pub-muted bg-pub-darker px-3 py-2"
                oninput={(event) => updateTier(index, { label: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>

            {#if editable}
              <div class="flex md:justify-end md:pb-0.5">
                <button
                  type="button"
                  class="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-500/50 text-red-300 hover:bg-red-500/10"
                  onclick={() => removeTier(index)}
                  aria-label="Remove tier"
                  title="Remove tier"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      {#if editable}
        <div class="flex flex-col gap-3 border-t border-pub-muted/40 pt-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            class="rounded-lg bg-pub-accent px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            onclick={addTier}
            disabled={availablePrizes.length === 0}
          >
            Add tier
          </button>
          {#if showSaveDefault}
            <label class="flex items-center gap-2 text-sm text-pub-muted">
              <input type="checkbox" bind:checked={saveAsDefault} class="rounded" />
              Save this as the default prize setup
            </label>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
