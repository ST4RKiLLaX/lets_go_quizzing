# Matching Question: Tap-to-Select Implementation Report

**Date:** 2025-02-18  
**Status:** Fixed (2025-02-18) — aligned with reorder pattern  
**Purpose:** Code review and architecture analysis

---

## Executive Summary

The matching question type uses a **two-tap flow**: (1) tap an option, (2) tap an item slot to assign it. Option selection works; slot assignment does not update the UI. The logic runs correctly (guards pass, `updateMatchingDraft` is called with valid data), but the UI does not re-render. The root cause is a **reactivity mismatch** between how the parent and child share draft state.

---

## Why Two Taps Is Hard

Conceptually, two taps is simple. In practice, several factors make it tricky:

1. **State split across two interactions** — Option selection and slot assignment are separate events. The child must hold "selected option" across the gap between tap 1 and tap 2. If that state is lost or stale, the second tap does nothing useful.

2. **Dual source of truth** — The parent keeps `matchingDraftByQuestionId` (plain object) and `matchingDraftStore` (Svelte store). Both must stay in sync. The child reads from the store (`$matchingDraftStore`) but updates via a callback that writes to both. Any desync or subscription quirk breaks reactivity.

3. **Different pattern than sibling types** — Reorder uses `bind:reorderDraft` (direct two-way binding). Matching uses store + callback. The inconsistency increases the chance of subtle bugs.

4. **Touch vs mouse** — Touch devices fire `pointerup`/`click` differently. We added `onpointerup` alongside `onclick`, but event ordering and focus can still behave differently.

5. **`@const` and store subscription** — The child derives `draft` from `$matchingDraftStore` inside `{@const}`. Svelte’s reactivity depends on the store subscription being active and the derived values being in the reactive graph. If the subscription or dependency chain is wrong, updates won’t propagate.

---

## Current Architecture

### Data Flow

```
Parent (play page)
├── matchingDraftByQuestionId: Record<string, number[]>
├── matchingDraftStore: Writable<Record<string, number[]>>
├── selectedMatchingOption: number | null
├── updateMatchingDraft(questionId, draft)
└── PlayerQuestionForm
    ├── matchingDraftStore (prop)
    ├── updateMatchingDraft (prop)
    ├── selectedMatchingOption (bind:)
    └── Reads: $matchingDraftStore
        Writes: updateMatchingDraft()
```

### Draft Model

- **`matchingDraftByQuestionId[questionId][i]`** = option index for item `i`, or `-1` if unmatched
- **`answer`** = `number[]` where `answer[i]` is the option index for item `i` (same as reorder)

---

## Code Examples for Review

### 1. Parent: State and Update Logic

**File:** `src/routes/play/[roomId]/+page.svelte`

```svelte
// State (lines 270-271)
let matchingDraftByQuestionId: Record<string, number[]> = {};
const matchingDraftStore = writable<Record<string, number[]>>({});

// Reset on question change (lines 295-296)
matchingDraftByQuestionId = {};
matchingDraftStore.set({});

// Update function (lines 580-584)
function updateMatchingDraft(questionId: string, draft: number[]) {
  if (hasSubmitted(questionId) || questionTimeExpired) return;
  matchingDraftByQuestionId = { ...matchingDraftByQuestionId, [questionId]: [...draft] };
  matchingDraftStore.set(matchingDraftByQuestionId);
}

// Initialization for matching question (lines 699-705)
$: if (currentQuestion?.type === 'matching' && !matchingDraftByQuestionId[currentQuestion.id]) {
  matchingDraftByQuestionId = {
    ...matchingDraftByQuestionId,
    [currentQuestion.id]: currentQuestion.items.map(() => -1),
  };
  matchingDraftStore.set(matchingDraftByQuestionId);
}
```

### 2. Parent: Props Passed to Child

**File:** `src/routes/play/[roomId]/+page.svelte` (lines 1016-1020)

```svelte
matchingDraftStore={matchingDraftStore}
updateMatchingDraft={updateMatchingDraft}
bind:selectedMatchingOption
```

### 3. Child: Slot Tap Handler

**File:** `src/lib/components/player/PlayerQuestionForm.svelte` (lines 62-84)

```svelte
function handleSlotTap(
  questionId: string,
  slotIndex: number,
  draft: number[],
  isFilled: boolean,
  selectedOpt: number | null
) {
  if (isMatchingSubmitted(questionId) || questionTimeExpired) {
    return;
  }
  if (selectedOpt != null) {
    const newDraft = [...draft];
    const prevSlot = newDraft.indexOf(selectedOpt);
    if (prevSlot >= 0) newDraft[prevSlot] = -1;
    newDraft[slotIndex] = selectedOpt;
    updateMatchingDraft(questionId, newDraft);
  } else if (isFilled) {
    const newDraft = [...draft];
    newDraft[slotIndex] = -1;
    updateMatchingDraft(questionId, newDraft);
  } else {
    // No selection, empty slot — no-op
  }
}
```

### 4. Child: Template — Draft Derivation and Slot UI

**File:** `src/lib/components/player/PlayerQuestionForm.svelte` (lines 279-306)

```svelte
{@const raw = ($matchingDraftStore ?? {})[q.id] ?? []}
{@const draft = mq.items.map((_, i) => raw[i] ?? -1)}
{@const allMatched = draft.length === mq.items.length && draft.every((v) => v >= 0)}

{#each mq.items as item, i}
  {@const optIdx = draft[i] ?? -1}
  {@const isFilled = optIdx >= 0}
  <div
    role="button"
    tabindex="0"
    class="..."
    onpointerup={() => handleSlotTap(q.id, i, draft, isFilled, selectedMatchingOption)}
    onclick={() => handleSlotTap(q.id, i, draft, isFilled, selectedMatchingOption)}
    onkeydown={(e) => e.key === 'Enter' && handleSlotTap(q.id, i, draft, isFilled, selectedMatchingOption)}
  >
    <span class="font-medium">{item}</span>
    <span class="block text-pub-muted text-sm mt-1">
      {isFilled ? mq.options[optIdx] : 'Tap to match'}
    </span>
  </div>
{/each}
```

### 5. Child: Option Buttons (Selection)

**File:** `src/lib/components/player/PlayerQuestionForm.svelte` (lines 312-331)

```svelte
{#each shuffledOptIndices as optIndex}
  {@const isSelected = selectedMatchingOption === optIndex}
  {@const isUsed = draft.includes(optIndex)}
  <button
    type="button"
    class="..."
    disabled={...}
    onclick={() => {
      if (isMatchingSubmitted(q.id) || questionTimeExpired) return;
      selectedMatchingOption = optIndex;
    }}
  >
    ...
  </button>
{/each}
```

---

## Comparison: Reorder vs Matching

| Aspect | Reorder | Matching |
|--------|---------|----------|
| Draft storage | `reorderDraft: number[]` (single array) | `matchingDraftByQuestionId` + `matchingDraftStore` |
| Binding | `bind:reorderDraft` | Store + callback, no bind |
| Child updates | `reorderDraft = newDraft` (direct) | `updateMatchingDraft(q.id, newDraft)` |
| Child reads | `reorderDraft` (prop) | `$matchingDraftStore` (store subscription) |
| Reactivity | Svelte binding propagates change | Store subscription should propagate |

Reorder works because the child mutates a bound prop; Svelte propagates the change and re-renders. Matching uses a store for reads and a callback for writes; if the store subscription or update path is wrong, the UI won’t update.

---

## Hypotheses for the Bug

1. **Store subscription not triggering** — The child uses `$matchingDraftStore` inside `{@const raw = ...}`. If the reactive dependency on the store value is not established correctly, updates may not trigger a re-render.

2. **`matchingDraftStore` null** — The child declares `matchingDraftStore: Writable<...> | null = null`. If it were ever null, `$matchingDraftStore` would fail. The parent always passes the store, so this is unlikely but worth verifying.

3. **Object reference equality** — `matchingDraftStore.set(matchingDraftByQuestionId)` passes the same object reference. Svelte store subscribers typically compare by reference; a new object should trigger. We do create a new object with `{ ...matchingDraftByQuestionId, [questionId]: [...draft] }`, so this should be fine.

4. **`{#key}` block remounting** — The form is inside `{#key currentQuestionKey}`. If the key changes, the component remounts. That should not prevent updates within the same question.

5. **Event ordering** — On touch, `pointerup` and `click` can both fire. We call `handleSlotTap` from both. Double invocation could cause odd behavior, but it shouldn’t prevent the first update from showing.

---

## Fix Applied (2025-02-18) ✓

Aligned with the reorder pattern:

1. **Parent:** Single `matchingDraft: number[]` with `bind:matchingDraft`; removed `matchingDraftStore` and `matchingDraftByQuestionId`.
2. **Child:** Uses `matchingDraft` prop directly; updates via `matchingDraft = newDraft` on slot tap.
3. **`selectedMatchingOption`:** Kept local to the child (form interaction state).
4. **Event handlers:** Removed `onpointerup` duplication; kept only `onclick`.

---

## Files to Review

| File | Relevant Lines |
|------|----------------|
| `src/routes/play/[roomId]/+page.svelte` | 270-271, 295-296, 580-584, 699-705, 1016-1020 |
| `src/lib/components/player/PlayerQuestionForm.svelte` | 57-58, 62-84, 279-350 |

---

## Appendix: Data Model Reference

```ts
// Question
type MatchingQuestion = {
  type: 'matching';
  id: string;
  text: string;
  items: string[];   // Left column
  options: string[]; // Right column (shuffled for display)
  answer: number[];  // answer[i] = option index for item i
};

// Draft: draft[i] = option index for item i, or -1
// Submission: answerIndexes: number[] (same format as reorder)
```
