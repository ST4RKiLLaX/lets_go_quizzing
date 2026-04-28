<script lang="ts">
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import PrizeTierEditor from '$lib/components/prizes/PrizeTierEditor.svelte';
  import type { PrizeOption, PrizeTier } from '$lib/types/prizes.js';

  export let open = false;
  export let prizeOptions: PrizeOption[] = [];
  export let addTierDisabledReason = '';
  export let prizeDraftEnabled = false;
  export let prizeDraftTiers: PrizeTier[] = [];
  export let onClose: () => void;
  export let onConfirm: () => void;
</script>

<ConfirmModal
  open={open}
  title="Room prizes"
  titleId="host-room-prizes-modal-title"
  cancelLabel="Close"
  confirmLabel="Save Prize Config"
  confirmButtonClass="bg-pub-accent text-white"
  onClose={onClose}
  onConfirm={onConfirm}
>
  <div class="mb-4 space-y-4">
    <PrizeTierEditor
      bind:enabled={prizeDraftEnabled}
      bind:tiers={prizeDraftTiers}
      availablePrizes={prizeOptions}
      {addTierDisabledReason}
      title="Room prizes"
      subtitle="Optional score or rank tiers for this room. Players can unlock prizes from every tier they match."
      emptyMessage="No room prize tiers configured."
    />
  </div>
</ConfirmModal>
