<script lang="ts">
  import type { ClaimedPrize, PrizeOption } from '$lib/types/prizes.js';

  export let claimedPrizes: ClaimedPrize[] = [];
  export let prizeEmailAvailableNow = false;
  export let prizeEmail = '';
  export let prizeEmailSending = false;
  export let prizeEligibilityLoading = false;
  export let prizeClaiming = false;
  export let prizeEligible = false;
  export let prizeOptions: PrizeOption[] = [];
  export let prizeStatusMessage = '';
  export let onSendEmailNow: () => void;
</script>

<div class="rounded-lg bg-pub-darker p-6 space-y-4">
  <h2 class="text-xl font-bold text-pub-gold">Prizes</h2>
  {#if claimedPrizes.length > 0}
    <p class="text-pub-muted">
      Your prize{claimedPrizes.length === 1 ? ' is' : 's are'} ready. Save {claimedPrizes.length === 1 ? 'it' : 'them'} now if you want to keep {claimedPrizes.length === 1 ? 'it' : 'them'}.
    </p>
    <div class="space-y-3">
      {#each claimedPrizes as prize, index}
        <div class="rounded-lg border border-pub-gold/30 bg-pub-dark p-4 space-y-2">
          <p class="text-xs uppercase tracking-wide text-pub-muted">Prize {index + 1}</p>
          <p class="font-semibold text-pub-gold">{prize.prizeName}</p>
          <a
            href={prize.prizeUrl}
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center justify-center rounded-lg bg-pub-accent px-4 py-3 font-medium text-white hover:opacity-90"
          >
            Open Prize Link
          </a>
          <p class="break-all text-sm text-pub-muted">{prize.prizeUrl}</p>
        </div>
      {/each}
    </div>
    {#if prizeEmailAvailableNow}
      <div class="space-y-2">
        <label class="block text-sm text-pub-muted" for="prize-email">
          Email {claimedPrizes.length === 1 ? 'this link' : 'these links'} now (optional)
        </label>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            id="prize-email"
            type="email"
            bind:value={prizeEmail}
            placeholder="you@example.com"
            class="flex-1 rounded-lg border border-pub-muted bg-pub-dark px-4 py-2"
          />
          <button
            type="button"
            class="rounded-lg bg-pub-accent px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
            onclick={onSendEmailNow}
            disabled={prizeEmailSending || !prizeEmail.trim()}
          >
            {prizeEmailSending ? 'Sending...' : 'Send email'}
          </button>
        </div>
        <div class="rounded-lg border border-pub-muted/50 bg-pub-dark px-3 py-2 text-xs text-pub-muted">
          We use your email address only to send the prize link{claimedPrizes.length === 1 ? '' : 's'}. We do not retain it after the code is sent.
        </div>
      </div>
    {/if}
  {:else if prizeEligibilityLoading}
    <p class="text-pub-muted">Checking prize eligibility...</p>
  {:else if prizeClaiming}
    <p class="text-pub-muted">
      Unlocking your prize{prizeOptions.length === 1 ? '' : 's'}...
    </p>
  {:else if prizeEligible && prizeOptions.length > 0}
    <div class="space-y-2">
      <p class="text-pub-muted">
        Unlocking {prizeOptions.length === 1 ? 'your prize' : 'your prizes'} automatically:
      </p>
      <ul class="space-y-2">
        {#each prizeOptions as prize}
          <li class="rounded-lg border border-pub-muted/50 bg-pub-dark px-4 py-3 text-pub-gold">
            {prize.name}
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <p class="text-pub-muted">{prizeStatusMessage || 'No prizes are available for this player.'}</p>
  {/if}
</div>
