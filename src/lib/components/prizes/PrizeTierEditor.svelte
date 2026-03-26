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
          <div class="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
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
                  <option value={prize.id}>{prize.name}</option>
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
          </div>

          {#if editable}
            <div class="mt-3 flex justify-end">
              <button
                type="button"
                class="rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                onclick={() => removeTier(index)}
              >
                Remove tier
              </button>
            </div>
          {/if}
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
