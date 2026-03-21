# Code Quality Pass 7: Play Page — Modals

## Goal

Extract the three modals from [play/[roomId]/+page.svelte](src/routes/play/[roomId]/+page.svelte) (~1026 lines) into dedicated components. This was deferred from Pass 6 for reassessment.

---

## Current State (Post Pass 6)

| Section   | Lines | Contents                                      |
| --------- | ----- | ---------------------------------------------- |
| Modals    | ~115  | Exit (~35), Settings (~55), Wake (~25)          |
| Script    | ~720  | Socket, handlers, wake, confetti, state        |
| Template  | ~190  | Main content + modals                           |

**Already extracted:** PlayerNav, PlayerConfetti, PlayerRevealView, SessionLeaderboardView (shared scoreboard/end UI — see DRY note below), PlayerJoinForm, PlayerLobbyForm, PlayerQuestionForm

**DRY note:** Scoreboard and end states use [`SessionLeaderboardView.svelte`](../src/lib/components/shared/SessionLeaderboardView.svelte) under `$lib/components/shared/`, which wraps [`LeaderboardPlayerList.svelte`](../src/lib/components/shared/LeaderboardPlayerList.svelte). The play page imports it from shared; the old `PlayerEndView.svelte` path was removed in favor of this component.

---

## Phase 1: Extract PlayerExitModal

**New file:** `src/lib/components/player/PlayerExitModal.svelte`

### Props

- `open: boolean`
- `inLobby: boolean`
- `leavingQuiz: boolean`
- `onClose: () => void`
- `onExit: () => void`

### Behavior

- Renders nothing when `open` is false
- Two message variants based on `inLobby`
- Cancel → `onClose`
- Exit quiz → `onExit` (disabled when `leavingQuiz`)

**Target:** ~35 lines moved.

---

## Phase 2: Extract PlayerWakeModal

**New file:** `src/lib/components/player/PlayerWakeModal.svelte`

### Props

- `open: boolean`
- `onClose: () => void`
- `onEnable: () => void`

### Behavior

- Renders nothing when `open` is false
- "Not now" → `onClose`
- "Enable" → `onEnable`

**Target:** ~25 lines moved. Lowest risk.

---

## Phase 3: Extract PlayerSettingsModal

**New file:** `src/lib/components/player/PlayerSettingsModal.svelte`

### Props

- `open: boolean`
- `draftName: string` (bindable)
- `draftEmoji: string` (bindable)
- `registerError: string`
- `unavailableEmojis: Set<string>`
- `emojiOptions: string[]`
- `onClose: () => void`
- `onSave: () => void`

### Page responsibility

- Page owns `settingsDraftName` and `settingsDraftEmoji`
- When opening the modal, initialize drafts from current player
- `onSave` commits drafts to `name`/`emoji` and calls `register()`; then closes
- `onClose` just closes — no rollback needed

Draft values are initialized by the page when opening the modal; cancel closes without mutating committed player state.

### Behavior

- Renders nothing when `open` is false
- Form with name input, emoji grid, error display
- Cancel → `onClose`
- Save → `onSave` (form submit)
- After a successful save, clear `registerError` (or ensure it is refreshed on reopen) so a stale error does not persist across modal sessions

**Save flow (implementation note):** commit drafts → call `register()` → clear/refresh `registerError` → close only on success (do not close on registration failure).

**Target:** ~55 lines moved. Highest prop count — reassess if >12 props.

---

## Stop Conditions

- Extracted components need >15 props
- Prop drilling becomes excessive
- Modal logic (when to open/close) duplicated instead of kept in page
- Type assertions or casts increase

---

## Execution Order

1. **Phase 2:** PlayerWakeModal first (smallest, fewest props)
2. **Phase 1:** PlayerExitModal
3. **Phase 3:** PlayerSettingsModal — reassess prop count before implementing

---

## Verification

- `npm run lint`, `npm run check`, `npm run build`, `npm test`, `npm run test:e2e`
- Manual: Exit modal (lobby vs in-game), Settings modal (name/emoji update), Wake modal (enable/not now)

---

## Out of Scope

- Changing modal behavior or UX
- Host or projector modals
- Shared modal base component (unless clear duplication emerges)
