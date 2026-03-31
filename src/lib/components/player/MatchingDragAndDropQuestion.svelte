<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { DragAndDropQuestion } from '$lib/types/quiz.js';
  import { getQuestionDisplayOptionIndices } from '$lib/utils/shuffle.js';

  export let question: DragAndDropQuestion;
  export let roomId: string;
  export let matchingDraft: number[] = [];
  export let questionTimeExpired: boolean;
  export let isMatchingSubmitted: (questionId: string) => boolean;
  export let submitMatching: (questionId: string, answerIndexes: number[]) => void;

  let draggingOptionIndex: number | null = null;
  let dragSourceSlotIndex: number | null = null;
  let hoverSlotIndex: number | null = null;
  let pointerX = 0;
  let pointerY = 0;
  let activePointerId: number | null = null;

  $: draft = question.items.map((_, i) => matchingDraft[i] ?? -1);
  $: optionIndices = getQuestionDisplayOptionIndices(question, roomId);
  $: unassignedOptionIndices = optionIndices.filter((optIndex) => !draft.includes(optIndex));
  $: allMatched = draft.length === question.items.length && draft.every((v) => v >= 0);

  function isDisabled() {
    return isMatchingSubmitted(question.id) || questionTimeExpired;
  }

  function startDrag(optionIndex: number, sourceSlotIndex: number | null, event: PointerEvent) {
    if (isDisabled()) return;
    event.preventDefault();
    draggingOptionIndex = optionIndex;
    dragSourceSlotIndex = sourceSlotIndex;
    hoverSlotIndex = null;
    pointerX = event.clientX;
    pointerY = event.clientY;
    activePointerId = event.pointerId;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-match-slot-index]');
    const slotIndex = slot instanceof HTMLElement ? Number(slot.dataset.matchSlotIndex) : NaN;
    hoverSlotIndex = Number.isInteger(slotIndex) ? slotIndex : null;
  }

  function handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    finishDrag(hoverSlotIndex);
  }

  function handlePointerCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    clearDragState();
  }

  function finishDrag(targetSlotIndex: number | null) {
    if (draggingOptionIndex == null || isDisabled()) {
      clearDragState();
      return;
    }

    const nextDraft = draft.map((value) => (value === draggingOptionIndex ? -1 : value));

    if (targetSlotIndex != null && targetSlotIndex >= 0 && targetSlotIndex < nextDraft.length) {
      const previousTargetValue = draft[targetSlotIndex] ?? -1;
      if (
        dragSourceSlotIndex != null &&
        dragSourceSlotIndex !== targetSlotIndex &&
        previousTargetValue >= 0 &&
        previousTargetValue !== draggingOptionIndex
      ) {
        nextDraft[dragSourceSlotIndex] = previousTargetValue;
      }
      nextDraft[targetSlotIndex] = draggingOptionIndex;
    }

    matchingDraft = nextDraft;
    clearDragState();
  }

  function clearDragState() {
    draggingOptionIndex = null;
    dragSourceSlotIndex = null;
    hoverSlotIndex = null;
    activePointerId = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
  }

  onDestroy(() => {
    clearDragState();
  });
</script>

<div class="space-y-4">
  <div class="space-y-3">
    <p class="text-sm font-medium text-pub-gold">Match each item by dragging an option into its slot</p>
    {#each question.items as item, itemIndex}
      {@const assignedOptionIndex = draft[itemIndex] ?? -1}
      {@const isHoverTarget = hoverSlotIndex === itemIndex}
      <div class="rounded-xl bg-pub-dark/70 border border-pub-muted/40 p-3 space-y-2">
        <div class="font-medium break-words">{item}</div>
        <div
          class="rounded-lg border-2 border-dashed px-3 py-3 min-h-[3.5rem] transition-colors {isHoverTarget ? 'border-pub-gold bg-pub-accent/10' : 'border-pub-muted/40 bg-pub-darker/60'} {isDisabled() ? 'opacity-60' : ''}"
          data-match-slot-index={itemIndex}
        >
          {#if assignedOptionIndex >= 0}
            <button
              type="button"
              class="w-full rounded-lg bg-pub-accent/20 px-3 py-2 text-left font-medium break-words select-none [touch-action:none]"
              disabled={isDisabled()}
              onpointerdown={(event) => startDrag(assignedOptionIndex, itemIndex, event)}
            >
              {question.options[assignedOptionIndex]}
            </button>
          {:else}
            <div class="text-sm text-pub-muted">Drag an option here</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="space-y-2">
    <p class="text-sm font-medium text-pub-gold">Options</p>
    <div class="flex flex-wrap gap-2">
      {#each unassignedOptionIndices as optionIndex}
        <button
          type="button"
          class="rounded-lg bg-pub-dark px-3 py-2 text-left break-words select-none [touch-action:none] {isDisabled() ? 'opacity-60' : 'hover:bg-pub-accent/20'}"
          disabled={isDisabled()}
          onpointerdown={(event) => startDrag(optionIndex, null, event)}
        >
          {question.options[optionIndex]}
        </button>
      {/each}
      {#if unassignedOptionIndices.length === 0}
        <div class="text-sm text-pub-muted">All options are placed. Drag a card out of a slot to unassign it.</div>
      {/if}
    </div>
  </div>

  {#if draggingOptionIndex != null}
    <div
      class="fixed z-50 pointer-events-none rounded-lg bg-pub-gold px-3 py-2 text-pub-darker font-semibold shadow-lg max-w-[min(20rem,80vw)] break-words"
      style="left: {pointerX}px; top: {pointerY}px; transform: translate(-50%, -50%);"
    >
      {question.options[draggingOptionIndex]}
    </div>
  {/if}

  {#if !isMatchingSubmitted(question.id)}
    <button
      type="button"
      class="mt-2 px-4 py-2 bg-pub-accent rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
      disabled={!allMatched || questionTimeExpired}
      onclick={() => {
        if (allMatched && !questionTimeExpired) {
          submitMatching(question.id, draft);
        }
      }}
    >
      Submit
    </button>
  {/if}
</div>
