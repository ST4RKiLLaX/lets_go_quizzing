<script lang="ts">
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';

  type QuizRef = { title: string; filename: string };

  export let quiz: QuizRef | null = null;
  export let onClose: () => void = () => {};
  export let onConfirm: () => void = () => {};
</script>

<ConfirmModal
  open={quiz != null}
  title="Delete quiz?"
  titleId="delete-quiz-modal-title"
  confirmLabel="Delete quiz"
  confirmButtonClass="bg-red-700"
  {onClose}
  {onConfirm}
>
  {#if quiz}
    <p class="text-sm text-pub-muted mb-2">
      <span class="text-pub-gold font-medium">{quiz.title}</span>
    </p>
    <p class="text-xs text-pub-muted font-mono break-all mb-5">{quiz.filename}</p>
    <p class="text-sm text-pub-muted mb-5">
      This cannot be undone. Associated images stored for this quiz will also be removed.
    </p>
  {/if}
</ConfirmModal>
