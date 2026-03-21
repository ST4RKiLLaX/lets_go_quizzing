# Code Quality Pass 6: Play Page — Reveal Phase & Polish

## Goal

Further slim [play/[roomId]/+page.svelte](src/routes/play/[roomId]/+page.svelte) (~1155 lines after Pass 5) by extracting the Reveal phase UI and optionally smaller pieces. Same incremental pattern as Pass 5.

---

## Current State (Post Pass 5)

| Section        | Lines | Contents                                                                 |
| -------------- | ----- | ------------------------------------------------------------------------ |
| Script         | ~600  | Socket, join/register, submit handlers, hasSubmitted/getSubmitted*, wake, confetti |
| Template       | ~555  | RevealAnswer (~77), Scoreboard/End (~25), modals (~120), lobby wait (~10) |

**Already extracted:** PlayerNav, PlayerConfetti, CountdownPie, PlayerJoinForm, PlayerLobbyForm, PlayerQuestionForm, question-helpers, emoji-options

---

## Phase 1: Extract Reveal Phase UI (Primary)

**New file:** [src/lib/components/player/PlayerRevealView.svelte](src/lib/components/player/PlayerRevealView.svelte)

**Design decision:** Separate component vs unified with PlayerQuestionForm.

- **Option A (recommended):** Separate `PlayerRevealView.svelte` — thin shell that switches on `question.type`, similar to PlayerQuestionForm. Reveal is read-only; no submit handlers. Simpler props.
- **Option B:** Unified `PlayerQuestionDisplay.svelte` with `mode: 'answer' | 'reveal'` — only if shared structure is substantial and reduces duplication. Re-evaluate after sketching Option A.

**Reveal phase question types (8):**

- `hotspot` — image + correct region overlay + player tap marker
- `choice` / `true_false` — options with correct (green) and chosen (gold) styling
- `multi_select` — options with correct/chosen styling
- `reorder` — correct order + "Your order" with per-item correct/incorrect
- `poll` — options + counts, chosen styling
- `slider` — correct value + "You selected"
- `input` — correct answer(s)
- `open_ended` / `word_cloud` — no explicit reveal UI in current template (explanation only)

**Props (minimal per type):**

- `question`, `roundName`, `currentQuestionNumber`, `currentRoundQuestionTotal`
- `countdown`, `totalTimerSeconds`, `quizFilename`, `optionLabelStyle`
- `hasSubmitted`, `getSubmittedAnswerIndex`, `getSubmittedAnswerIndexes`, `getSubmittedHotspot`, `getSubmittedAnswerNumber`
- `selectedAnswer`, `selectedMultiSelect` (for optimistic display before state sync)
- `submissions` (for getOptionCounts on poll)
- `formatOptionLabel`, `getQuestionOptions`, `getQuestionImageSrc`

**Target:** ~80 lines of Reveal template moved out.

**Checkpoint:** Manual test — all question types in Reveal phase, correct/incorrect styling, confetti on correct.

---

## Phase 2: Extract Modals (Optional)

**New files:**

- `PlayerExitModal.svelte` — exit confirmation, inLobby vs in-game messaging
- `PlayerSettingsModal.svelte` — name/emoji update form (reuses EMOJI_OPTIONS, unavailableEmojis)
- `PlayerWakeModal.svelte` — wake enable prompt (if not already minimal)

**Props:** `open`, `onClose`, bindings/callbacks as needed. Keep modal logic in page.

**Target:** ~120 lines moved. Lower priority than Phase 1.

---

## Phase 3: Extract Scoreboard/End Block (Optional) — **Superseded**

Originally targeted `PlayerEndView.svelte` or `PlayerScoreboard.svelte`. **Implemented later as shared DRY:** [`SessionLeaderboardView.svelte`](../src/lib/components/shared/SessionLeaderboardView.svelte) (projector + play) and [`LeaderboardPlayerList.svelte`](../src/lib/components/shared/LeaderboardPlayerList.svelte) (also used by [`HostLeaderboardView.svelte`](../src/lib/components/host/HostLeaderboardView.svelte)). The standalone `PlayerEndView.svelte` and duplicate `ProjectorLeaderboardView.svelte` were removed.

---

## Stop Conditions

Stop if:

- Extracted components need >15 props
- Prop drilling becomes excessive
- Duplicated logic between Question and Reveal instead of reduced
- Type assertions or casts increase

---

## Execution Order

1. **Phase 1:** Create PlayerRevealView.svelte (thin shell, switch on question.type)
2. Checkpoint: Manual test Reveal phase
3. **Phase 3:** Scoreboard/end UI — done via `SessionLeaderboardView` + `LeaderboardPlayerList` (shared with host/projector/play)
4. **Phase 2** (optional): Modals — reassess after Phase 1

---

## Verification

- `npm run lint`, `npm run check`, `npm run build`, `npm test`
- Manual: Reveal phase for all question types; correct/incorrect styling; confetti; end screen; modals

---

## Out of Scope

- Changing answer submission logic or socket events
- Splitting host or projector pages
- Adding Vitest/Playwright for play page
