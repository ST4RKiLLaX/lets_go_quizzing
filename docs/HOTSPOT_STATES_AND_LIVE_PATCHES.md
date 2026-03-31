# Hotspot States And Live Patches

This note explains how hotspot questions are rendered across screens and how
live question patches differ from full state updates.

## Intended Screen Behavior

| Phase | Player | Host | Projector |
| --- | --- | --- | --- |
| `Question` before submit | Show image and player's draft marker only | Show image only | Show image only |
| `Question` after submit | Show player's submitted marker only | Show live player emoji markers | Show image only |
| `RevealAnswer` | Show correct area and player's marker | Show correct area and all player markers | Show correct area and all player markers |

## Data Sources By Screen

### Player

- File: `src/lib/components/player/PlayerQuestionForm.svelte`
- Uses local draft state from `hotspotDraftByQuestionId`.
- Uses `getSubmittedHotspot()` to keep showing the player's own submitted spot.
- Does not depend on `question:patch` hotspot marker data.

### Host

- File: `src/routes/host/[roomId]/+page.svelte`
- During `Question`, host markers come from `questionPatch.hotspotSubmissions`
  via `getLiveHotspotSubmissions()`.
- During `RevealAnswer`, host markers come from authoritative
  `state.submissions` via `getRevealHotspotSubmissions()`.

### Projector

- File: `src/lib/components/projector/ProjectorQuizPhaseView.svelte`
- During `Question`, projector intentionally renders no hotspot markers.
- During `RevealAnswer`, projector markers come from authoritative
  `state.submissions`.

## Server Patch Flow

### Player answer submission

- File: `src/lib/server/socket/handlers.ts`
- Event: `player:answer`
- Hotspot answers are stored as:
  - `answerX`
  - `answerY`
- After storing the submission, the server queues a `question:patch`.

### Question patch batching

- File: `src/lib/server/socket/question-patch.ts`
- `queueQuestionPatch()` batches answer-driven updates with a short delay.
- Only valid during `Question` phase.

### Patch broadcasting

- File: `src/lib/server/socket/broadcast.ts`
- `broadcastQuestionPatchToRoom()` sends role-specific question patches:
  - host gets `serializeQuestionPatch(state, 'host')`
  - projector gets `serializeQuestionPatch(state, 'projector')`

### Role-specific hotspot payloads

- File: `src/lib/server/socket/serializers.ts`
- `serializeQuestionPatch()` includes `hotspotSubmissions` for `host` only.
- Projector question patches stay narrow and do not include hotspot markers.
- Full `state:update` payloads for host and projector still include
  `state.submissions`, so reveal can render all markers from authoritative
  state instead of question patches.

## Why This Split Exists

- Host needs live hotspot markers during the question so the quiz runner can
  monitor answers in real time.
- Projector must not show markers during the question because that leaks hints.
- Reveal should use full state, not ephemeral question-patch data, so host and
  projector stay aligned after the transition.

## Related Files

- `src/lib/components/player/PlayerQuestionForm.svelte`
- `src/lib/components/player/PlayerRevealView.svelte`
- `src/routes/host/[roomId]/+page.svelte`
- `src/lib/components/projector/ProjectorQuizPhaseView.svelte`
- `src/lib/server/socket/handlers.ts`
- `src/lib/server/socket/question-patch.ts`
- `src/lib/server/socket/broadcast.ts`
- `src/lib/server/socket/serializers.ts`
- `src/lib/types/game.ts`
