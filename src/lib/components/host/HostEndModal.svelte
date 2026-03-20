<script lang="ts">
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';

  export let open = false;
  export let onClose: () => void = () => {};
  export let onConfirm: () => void = () => {};
</script>

<ConfirmModal
  {open}
  title="End quiz now?"
  titleId="host-end-quiz-modal-title"
  confirmLabel="End Quiz"
  confirmButtonClass="bg-[#CF3030]"
  {onClose}
  {onConfirm}
  closeOnBackdrop={false}
>
  <p class="text-sm text-pub-muted mb-5">
    If you end the quiz now, all players and the projector will immediately see that the quiz has ended.
    This room cannot continue from where it left off.
  </p>
</ConfirmModal>
