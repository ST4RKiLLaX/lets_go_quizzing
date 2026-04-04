<script lang="ts">
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import { getClaimablePrizeOptions, isPrizeOptionClaimable } from '$lib/prizes/config-validation.js';
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
  export let enabledLabel = 'Enable for this room';
  export let addTierDisabledReason = '';
  let showAddTierDisabledModal = false;

  $: claimablePrizes = getClaimablePrizeOptions(availablePrizes);

  function buildDefaultPrizeIds(): string[] {
    return claimablePrizes[0]?.id ? [claimablePrizes[0].id] : [];
  }

  function addTier() {
    tiers = [...tiers, { awardBy: 'score', minScore: 0, prizeIds: buildDefaultPrizeIds(), label: '' }];
  }

  function updateTier(index: number, updates: Partial<PrizeTier>) {
    tiers = tiers.map((tier, currentIndex) =>
      currentIndex === index ? { ...tier, ...updates } : tier
    );
  }

  function updateTierAwardBy(index: number, awardBy: 'score' | 'rank') {
    const tier = tiers[index];
    if (!tier) return;
    if (awardBy === 'rank') {
      updateTier(index, { awardBy, minScore: undefined, topCount: tier.topCount ?? 1 });
      return;
    }
    updateTier(index, { awardBy, minScore: tier.minScore ?? 0, topCount: undefined });
  }

  function updateTierThreshold(index: number, rawValue: string) {
    const tier = tiers[index];
    if (!tier) return;
    const numericValue = Number(rawValue);
    if (tier.awardBy === 'rank') {
      updateTier(index, { topCount: Math.max(1, Math.floor(numericValue || 1)) });
      return;
    }
    updateTier(index, { minScore: Math.max(0, Math.floor(numericValue || 0)) });
  }

  function removeTier(index: number) {
    tiers = tiers.filter((_, currentIndex) => currentIndex !== index);
  }

  function getPrizeOptionLabel(prize: PrizeOption): string {
    return prize.remainingQuantity != null ? `${prize.remainingQuantity} remain : ${prize.name}` : prize.name;
  }

  function addTierPrize(index: number) {
    const tier = tiers[index];
    if (!tier) return;
    const nextPrizeId = claimablePrizes.find((prize) => !tier.prizeIds.includes(prize.id))?.id ?? '';
    if (!nextPrizeId) return;
    updateTier(index, { prizeIds: [...tier.prizeIds, nextPrizeId] });
  }

  function updateTierPrize(index: number, prizeIndex: number, prizeId: string) {
    const tier = tiers[index];
    if (!tier) return;
    const prizeIds = [...tier.prizeIds];
    prizeIds[prizeIndex] = prizeId;
    updateTier(index, { prizeIds });
  }

  function removeTierPrize(index: number, prizeIndex: number) {
    const tier = tiers[index];
    if (!tier) return;
    updateTier(index, { prizeIds: tier.prizeIds.filter((_, currentIndex) => currentIndex !== prizeIndex) });
  }

  function handleAddTierClick() {
    if (claimablePrizes.length === 0) {
      if (addTierDisabledReason) {
        showAddTierDisabledModal = true;
      }
      return;
    }
    addTier();
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
      {enabledLabel}
    </label>
  </div>

  {#if enabled}
    <div class="space-y-3">
      {#if tiers.length === 0}
        <p class="text-sm text-pub-muted">{emptyMessage}</p>
      {/if}

      {#each tiers as tier, index}
        <div class="rounded-xl border border-pub-muted bg-pub-dark p-4">
          <div class="grid gap-3 md:grid-cols-[140px_110px_minmax(0,1fr)_auto] md:items-end">
            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">Award by</span>
              <select
                value={tier.awardBy ?? 'score'}
                disabled={!editable}
                class="w-full rounded-lg border border-pub-muted bg-pub-darker px-3 py-2"
                onchange={(event) => updateTierAwardBy(index, (event.currentTarget as HTMLSelectElement).value as 'score' | 'rank')}
              >
                <option value="score">Score</option>
                <option value="rank">Rank</option>
              </select>
            </label>

            <label class="block text-sm">
              <span class="mb-1 block text-pub-muted">{tier.awardBy === 'rank' ? 'Top count' : 'Min score'}</span>
              <input
                type="number"
                min={tier.awardBy === 'rank' ? 1 : 0}
                value={tier.awardBy === 'rank' ? (tier.topCount ?? 1) : (tier.minScore ?? 0)}
                disabled={!editable}
                class="w-full rounded-lg border border-pub-muted bg-pub-darker px-3 py-2"
                oninput={(event) => updateTierThreshold(index, (event.currentTarget as HTMLInputElement).value)}
              />
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

          <div class="mt-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-pub-muted">Prizes in this tier</span>
              {#if editable}
                <button
                  type="button"
                  class="rounded-lg border border-pub-muted px-3 py-1.5 text-sm hover:bg-pub-darker disabled:opacity-50"
                  onclick={() => addTierPrize(index)}
                  disabled={claimablePrizes.length === 0 || tier.prizeIds.length >= claimablePrizes.length}
                >
                  Add prize
                </button>
              {/if}
            </div>

            {#if tier.prizeIds.length === 0}
              <p class="text-sm text-pub-muted">No prizes assigned to this tier.</p>
            {/if}

            {#each tier.prizeIds as prizeId, prizeIndex}
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <label class="block text-sm">
                  <span class="mb-1 block text-pub-muted">Prize {prizeIndex + 1}</span>
                  <select
                    value={prizeId}
                    disabled={!editable}
                    class="w-full rounded-lg border border-pub-muted bg-pub-darker px-3 py-2"
                    onchange={(event) => updateTierPrize(index, prizeIndex, (event.currentTarget as HTMLSelectElement).value)}
                  >
                    <option value="" disabled selected={!prizeId}>Select a prize</option>
                    {#each availablePrizes as prize}
                      <option value={prize.id} disabled={!isPrizeOptionClaimable(prize) && prize.id !== prizeId}>
                        {getPrizeOptionLabel(prize)}
                      </option>
                    {/each}
                  </select>
                </label>

                {#if editable}
                  <button
                    type="button"
                    class="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-500/50 text-red-300 hover:bg-red-500/10"
                    onclick={() => removeTierPrize(index, prizeIndex)}
                    aria-label="Remove prize"
                    title="Remove prize"
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
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}

      {#if editable}
        <div class="flex flex-col gap-3 border-t border-pub-muted/40 pt-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            class="rounded-lg bg-pub-accent px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 {claimablePrizes.length === 0 ? 'cursor-not-allowed opacity-50' : ''}"
            onclick={handleAddTierClick}
            aria-disabled={claimablePrizes.length === 0}
          >
            Add tier
          </button>
          {#if addTierDisabledReason}
            <p class="text-sm text-pub-muted">{addTierDisabledReason}</p>
          {/if}
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

<ConfirmModal
  open={showAddTierDisabledModal}
  title="Can't add tier"
  titleId="prize-tier-disabled-modal-title"
  cancelLabel="Close"
  confirmLabel="OK"
  confirmButtonClass="bg-pub-accent text-white"
  onClose={() => {
    showAddTierDisabledModal = false;
  }}
  onConfirm={() => {
    showAddTierDisabledModal = false;
  }}
>
  <p class="text-sm text-pub-muted">
    {addTierDisabledReason || 'No prizes are currently available for a new tier.'}
  </p>
</ConfirmModal>
