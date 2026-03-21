# Code Quality Reassessments — Pending Backlog

Four reassessments from Pass 8 and Pass 9 were never performed. This document records the formal reassessment for each, with a recommendation.

**Priority order:** Host Question/Reveal → Host Sidebar → Projector Question/Reveal → Projector Lobby

---

## 1. Pass 8 Phase 3 — Host Question/Reveal Block

| Field | Value |
|-------|-------|
| **Current line count** | ~155 lines (template 262–393 + `getWrongAnswerDisplay` helper 186–207) |
| **Location** | `src/routes/host/[roomId]/+page.svelte` |
| **Proposed component** | `HostQuestionRevealView.svelte` |

### What makes extraction attractive

- Largest remaining chunk on the host page (~155 lines)
- Single cohesive block: Question and RevealAnswer in one view
- Would slim the host page significantly and improve scanability

### What makes it risky

- Host needs **both** Question-phase and Reveal-phase data in one component
- Host-specific features: submission counts, wrong-answer override UI (+/−), Next button, `getWrongAnswerDisplay` helper
- Prop count could exceed 15 if passed naively
- Overlaps with `PlayerRevealView` — risk of duplicating logic without a clear shared abstraction
- Stop condition: "Extracting HostQuestionRevealView duplicates logic already present in PlayerRevealView without creating a clear shared abstraction"

### Expected prop/model shape

Page-derived **display model** (not a catch-all `revealData`):

- `question`, `roundName`, `currentQuestionNumber`, `currentRoundQuestionTotal`
- `stateType: 'Question' | 'RevealAnswer'`
- `countdown`, `totalTimerSeconds`, `quizFilename`, `optionLabelStyle`
- Precomputed: `submissionCount`, `totalPlayers`, `wrongAnswersDisplay` (array of display strings), `optionCounts` (for poll/multi_select)
- Callbacks: `onNext`, `onOverride(playerId, questionId, delta)`

Estimated: 12–15 props. Stop if >15.

### Stop conditions

- Extracted component needs >15 props
- Prop drilling becomes excessive
- Duplicated logic between host and player instead of reduced
- Type assertions or casts increase
- Extraction duplicates PlayerRevealView logic without creating a clear shared abstraction

### Recommendation

**Defer.** The host block differs from PlayerRevealView in structure (Question + Reveal in one block), data (override UI, submission counts), and callbacks. Extracting would likely create a parallel component with no shared abstraction. The host page is manageable at ~633 lines; the gain does not justify the risk of duplication. Revisit only if a shared Host/Player question display abstraction emerges from a different refactor.

---

## 2. Pass 8 Phase 4 — Host Sidebar

**Status:** Extracted. Component lives at [`src/lib/components/host/HostSidebar.svelte`](../src/lib/components/host/HostSidebar.svelte) and is used from the host room page. Line counts below are historical.

| Field | Value |
|-------|-------|
| **Current line count** | ~58 lines (426–483) |
| **Location** | `src/routes/host/[roomId]/+page.svelte` |
| **Component** | `HostSidebar.svelte` (implemented under `$lib/components/host/`) |

### What makes extraction attractive

- Self-contained block: pending players (approve/deny) + player list (kick)
- Clear boundary; no overlap with Question/Reveal
- Would further slim the host page

### What makes it risky

- Depends on `state`, `kickError`, and several callbacks
- Prop count is modest (~6–8) — low risk
- Conditional visibility: only shown when `state` exists and type is Lobby/Question/RevealAnswer/Scoreboard/End

### Expected prop/model shape

- `state: SerializedState` (or `pendingPlayers`, `players`, `kickError` as separate props)
- `onKick(playerId, ban?)`, `onApprove(playerId)`, `onDeny(playerId)`, `onApproveAll()`

If passing `state`: ~5 props. If destructuring: ~8 props.

### Stop conditions

- Extracted component needs >15 props
- Prop drilling becomes excessive

### Recommendation

**Done** (was: extract now). Host sidebar is a dedicated component; player list uses `sortPlayersByScore` from `$lib/utils/players.js` for ordering.

---

## 3. Pass 9 Phase 3 — Projector Question/Reveal Block

| Field | Value |
|-------|-------|
| **Current line count** | ~281 lines (Question 217–332, RevealAnswer 333–497) |
| **Location** | `src/routes/projector/[roomId]/+page.svelte` |
| **Proposed component(s)** | `ProjectorQuestionView.svelte`, `ProjectorRevealView.svelte` (or single `ProjectorQuestionRevealView`) |

### What makes extraction attractive

- Largest chunk on the projector page (~281 lines)
- Projector is read-only — no submission UI, no override UI
- Clear separation: Question shows options + answered list; Reveal shows answer + correct styling

### What makes it risky

- Two distinct blocks (Question vs RevealAnswer) with different data needs
- Projector has `getAnsweredInOrder` and `getCorrectAnswersInRankOrder` helpers
- Question types overlap with host and player — risk of three parallel implementations
- Prop count could exceed 15 if passed naively
- Stop condition: "Extracting duplicates logic already present in Host/PlayerRevealView without creating a clear shared abstraction"

### Expected prop/model shape

Page-derived display model:

- `question`, `roundName`, `currentQuestionNumber`, `currentRoundQuestionTotal`
- `stateType: 'Question' | 'RevealAnswer'`
- `countdown`, `totalTimerSeconds`, `quizFilename`, `optionLabelStyle`
- Precomputed: `answeredList`, `rankedCorrectList`, `optionCounts`

Estimated: 10–12 props per component if split.

### Stop conditions

- Extracted component needs >15 props
- Prop drilling becomes excessive
- Duplicated logic between projector and host/player instead of reduced
- Extraction duplicates Host/PlayerRevealView logic without creating a clear shared abstraction

### Recommendation

**Defer.** Same rationale as Host Question/Reveal: projector Question/Reveal shares structure with host and player but has different data (answered list, ranked correct, no override). Extracting would create a third parallel component. The projector page is ~508 lines; manageable. Revisit only if a shared Host/Player/Projector display abstraction emerges.

---

## 4. Pass 9 Phase 4 — Projector Lobby

| Field | Value |
|-------|-------|
| **Current line count** | ~16 lines (224–239) |
| **Location** | `src/routes/projector/[roomId]/+page.svelte` |
| **Proposed component** | `ProjectorLobbyView.svelte` |

### What makes extraction attractive

- Small, self-contained block
- Component owns QR canvas locally; page passes only `roomId` and `joinUrl`
- Lowest risk of the four

### What makes it risky

- QR code is drawn imperatively via `generate(joinUrl).toCanvas(qrCanvas)` — component must own the canvas and call `generate` when `joinUrl` changes
- Minimal risk; straightforward extraction

### Expected prop/model shape

- `roomId: string`
- `joinUrl: string`

Component owns canvas element; uses `onMount` or `$:` to call `generate(joinUrl).toCanvas(canvas)` when `joinUrl` is truthy.

**Implementation note:** Redraw when `joinUrl` changes. Clear or replace the canvas safely if the component rerenders or unmounts.

### Stop conditions

- None material for this size

### Recommendation

**Extract.** Small, low risk, clear boundary. Component owns canvas; page passes only data. Good incremental win. Can be done independently of Projector Question/Reveal.

---

## Summary

| Item | Recommendation | Rationale |
|------|----------------|-----------|
| Host Question/Reveal | **Defer** | High risk of duplicating PlayerRevealView; no shared abstraction |
| Host Sidebar | **Extract** | Low risk, clear boundary, modest props |
| Projector Question/Reveal | **Defer** | Same as host; third parallel component |
| Projector Lobby | **Extract now** | Small, low risk, component owns canvas |

**Suggested implementation order:** Projector Lobby first (smallest), then Host Sidebar.
