# Code Quality Pass 5: Play Page Split

**Goal:** Slim [play/[roomId]/+page.svelte](src/routes/play/[roomId]/+page.svelte) (~1600 lines) by extracting join flow, question UI, and pure helpers. Follow the same pattern as Pass 3 (QuizEditor) and Pass 4 (socket handlers).

**Stop point:** Stop if: extracted components need many optional props; prop drilling becomes excessive; shared state (selectedAnswer, reorderDraft, etc.) forces awkward callbacks; type assertions increase.

---

## Current State

The play page contains:

- **Script (~630 lines):** Socket setup, join/register logic, submit handlers (choice, multi_select, reorder, slider, hotspot, input), hasSubmitted/getSubmitted* helpers, wake manager, confetti
- **Template (~970 lines):** Join flow (password, request form, waiting, denied), lobby registration, lobby waiting, Question phase (8 question types), RevealAnswer phase (6 question types), End phase, modals (exit, settings, wake)

**Already extracted:** PlayerNav, PlayerConfetti, CountdownPie

---

## Phase 1: Extract Pure Helpers

**New file:** `src/lib/player/answer-helpers.ts`

Move pure functions (no socket, no reactive state):

- `getQuestionOptions(q: Question): string[]`
- `getOptionCounts(submissions, questionId): Map<number, number>`
- `formatOptionLabel` / `getOptionLabelStyle` — already in utils, keep using
- `getShuffledReorderIndices` — already in utils

**Keep in page:** `hasSubmitted`, `getSubmittedAnswerIndex`, `getSubmittedAnswerIndexes`, etc. — they depend on `state` and `getOrCreatePlayerId()`. Consider passing `state` and `playerId` as args to make them pure, or leave in page for now.

**Checkpoint:** Lint, check, build. No behavior change.

---

## Phase 2: Extract Join Flow Component

**New file:** `src/lib/components/player/PlayerJoinForm.svelte`

Props:

- `roomId`, `joinPassword`, `name`, `emoji`
- `joiningRoom`, `needsRoomPassword`, `needsRequestForm`, `waitingForApproval`, `deniedByHost`, `wasKickedFromRoom`, `joinError`, `requestFormUnavailableEmojis`
- `onJoin`, `onEmojiChange`, `onNameChange`, `onPasswordChange` (or bind:value pattern)
- `EMOJI_OPTIONS` (or import shared constant)

Renders: wasKicked, needsRequestForm, waitingForApproval, deniedByHost, needsRoomPassword, generic errors, "Joining room...".

**Keep in page:** `joinRoom`, socket setup, state. Page passes callbacks and bindings.

**Target:** Extract ~200 lines of template.

---

## Phase 3: Extract Question Phase UI

**New file:** `src/lib/components/player/PlayerQuestionForm.svelte`

Props:

- `question`, `state`, `quizFilename`
- `questionTimeExpired`, `hasSubmitted`, `getSubmittedAnswerIndex`, `getSubmittedAnswerIndexes`, `getSubmittedHotspot`, `getSubmittedAnswerNumber`, `getQuestionOptions`, `getSelectedOptionLabel`, `getSelectedOptionLabels`
- `selectedAnswer`, `selectedMultiSelect`, `selectedReorder`, `selectedSlider`, `selectedHotspot`, `selectedInput`
- `multiSelectDraft`, `reorderDraft`, `sliderAnswer`, `inputAnswer`
- `onSubmitChoice`, `onSubmitMultiSelect`, `onSubmitReorder`, `onSubmitSlider`, `onSubmitHotspot`, `onSubmitInput`
- `onToggleMultiSelect`, `onReorderMove`
- `optionLabelStyle`, `totalTimerSeconds`, `currentRoundQuestionTotal`, `currentQuestionNumber`
- `countdown` (for CountdownPie)

This is a large prop surface. Alternative: pass a single `ctx` object with all callbacks and state. Or split by question type into smaller components (PlayerChoiceQuestion, PlayerReorderQuestion, etc.) if the single component grows too large.

**Stop if:** Prop count exceeds ~15 or ctx becomes a grab-bag.

---

## Phase 4: Extract Reveal Phase UI (Optional)

**New file:** `src/lib/components/player/PlayerRevealView.svelte`

Similar to Phase 3 but for RevealAnswer — shows correct answers, player's choice, wrong/correct styling. Shares much structure with Question phase. Consider a shared `PlayerQuestionDisplay.svelte` that takes a `mode: 'answer' | 'reveal'` if the templates are similar enough.

**Defer** if Phase 2–3 already achieve meaningful reduction.

---

## Phase 5: Extract Lobby Registration (Optional)

**New file:** `src/lib/components/player/PlayerLobbyForm.svelte`

The "Join the quiz" form (name + emoji). Smaller extraction, ~70 lines. Do if time permits.

---

## Execution Order

1. Phase 1: Create answer-helpers.ts, move pure functions.
2. **Checkpoint:** Lint, check, build.
3. Phase 2: Create PlayerJoinForm.svelte, wire from page.
4. **Checkpoint:** Manual test — join with/without password, waiting room, denied.
5. Phase 3: Create PlayerQuestionForm.svelte, wire from page.
6. **Checkpoint:** Manual test — all question types, submit, timer.
7. Phase 4–5 if beneficial.

---

## Verification

- `npm run lint` — 0 errors
- `npm run check` — 0 errors
- `npm run build` — passes
- `npm test` — all pass
- Manual: join, register, answer each question type, reveal, end, exit, settings, wake modal

---

## Out of Scope

- Changing answer submission logic
- Adding Vitest/Playwright for play page
- Splitting host or projector pages
