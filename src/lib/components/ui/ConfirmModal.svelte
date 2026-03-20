<script lang="ts">
  export let open = false;
  export let title = '';
  /** Must match h2 id for aria-labelledby */
  export let titleId = 'confirm-modal-title';
  export let cancelLabel = 'Cancel';
  export let confirmLabel = 'Confirm';
  /** Tailwind background (and any extra) classes for the confirm button */
  export let confirmButtonClass = 'bg-red-700';
  export let onClose: () => void = () => {};
  export let onConfirm: () => void = () => {};
  export let closeOnBackdrop = true;
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    onclick={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <div class="w-full max-w-md bg-pub-darker border border-pub-muted rounded-lg p-5">
      <h2 id={titleId} class="text-lg font-semibold text-pub-gold mb-3">{title}</h2>
      <slot />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 bg-pub-darker border border-pub-muted rounded-lg font-medium hover:opacity-90"
          onclick={onClose}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg font-medium hover:opacity-90 {confirmButtonClass}"
          onclick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
