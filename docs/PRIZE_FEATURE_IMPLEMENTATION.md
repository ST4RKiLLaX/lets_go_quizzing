# Prize Feature Implementation

**Status:** Implemented  
**Purpose:** Document the current prize subsystem architecture and flow

---

## Goal

The prize feature adds an optional, room-based redemption flow for
high-scoring players without introducing a database.

When disabled, it should have no visible or behavioral presence in the
app. When enabled, the host can:

- manage a global prize pool in Settings
- optionally assign prize tiers during room setup
- optionally edit room prize tiers again while the room is still in the
  lobby
- let eligible players claim a limited-use prize link after the game ends
- optionally send that revealed link once by email without storing PII

---

## High-Level Design

The implementation is split into four layers:

1. **Shared types**
   - `src/lib/types/prizes.ts`
   - Defines prize records, room prize config, tiers, and eligibility
     shapes.

2. **Server prize domain**
   - `src/lib/server/prizes/schema.ts`
   - `src/lib/server/prizes/store.ts`
   - `src/lib/server/prizes/service.ts`
   - Handles validation, file persistence, token signing, eligibility,
     claiming, and optional email delivery.

3. **API surface**
   - `src/routes/api/prizes/**`
   - Exposes prize options, CRUD, eligibility, claim, and email actions.

4. **UI integration**
   - `src/routes/settings/+page.svelte`
   - `src/routes/+page.svelte`
   - `src/routes/host/[roomId]/+page.svelte`
   - `src/routes/play/[roomId]/+page.svelte`
   - `src/lib/components/prizes/PrizeTierEditor.svelte`

The core quiz engine remains prize-agnostic except for carrying
`roomPrizeConfig` in room state and including `prizeClaimToken` in the
player end-state.

---

## Feature Gating

App-level gating lives in config:

- `prizesEnabled?: boolean`
- `prizeEmailEnabled?: boolean`
- `prizeEmailSmtpHost?: string`
- `prizeEmailSmtpPort?: number`
- `prizeEmailSmtpSecure?: boolean`
- `prizeEmailSmtpUsername?: string`
- `prizeEmailFromEmail?: string`
- `prizeEmailFromName?: string`
- `defaultRoomPrizeConfig?: RoomPrizeDefaultConfig`

Relevant files:

- `src/lib/server/config.ts`
- `src/routes/api/settings/+server.ts`

Behavior:

- If `prizesEnabled` is `false`, prize UI and prize API behavior should be
  absent.
- If `prizesEnabled` is `true`, Settings exposes prize management and room
  creation can optionally attach room-level prize tiers.
- Email send is separately gated by `prizeEmailEnabled` and SMTP config.

---

## Data Model

### Prize Definition

Stored in `data/prizes.json`.

Fields:

- `id`
- `name`
- `url`
- `limit`
- `expirationDate`
- `usage`
- `active`
- `notes?`
- `createdAt`
- `updatedAt`

`id` is generated as a SHA-256 fingerprint slice from:

- normalized prize name
- normalized prize URL
- limit
- expiration date
- `createdAt`

This keeps ID generation server-side and avoids manual ID entry.

### Room Prize Config

Attached to game state as `roomPrizeConfig`.

Fields:

- `enabled`
- `tiers`
- `configuredAt`
- `configuredBy`

Each tier contains:

- `minScore`
- `prizeId`
- `label?`

Tiers are normalized and sorted descending by `minScore`, so the best
eligible tier is the first score match.

### Prize Redemption Record

Stored in `data/prize-redemptions.json`.

Fields include:

- `redemptionId`
- `roomId`
- `quizFilename`
- `playerId`
- `playerName`
- `playerEmoji`
- `finalScore`
- `prizeId`
- `prizeNameSnapshot`
- `prizeUrlSnapshot`
- `redeemedAt`
- `status`

The system stores snapshots of prize name and URL at redemption time so
later prize edits do not rewrite a completed claim.

---

## Persistence Model

Prize storage is file-backed and database-free.

Files:

- `data/prizes.json`
- `data/prize-redemptions.json`
- `data/secrets.json`

Implementation:

- `src/lib/server/prizes/store.ts`

Characteristics:

- atomic write pattern via temp file + rename
- mutation lock to serialize concurrent prize writes
- paths resolved from `process.cwd()` so tests can isolate storage

This keeps the subsystem self-contained while matching the app’s existing
file-based architecture.

### SMTP Config Split

Prize email SMTP configuration is split across two files:

- `data/config.json`
  - readable SMTP fields such as host, port, secure mode, username,
    from email, and from name
- `data/secrets.json`
  - SMTP password only

The admin UI can round-trip readable SMTP settings, but it never reads
back the stored SMTP password. The browser only receives configured/not
configured status for that secret.

---

## Server Flow

### Prize Pool Management

Settings UI calls authenticated prize APIs:

- `GET /api/prizes`
- `POST /api/prizes`
- `PUT /api/prizes/[id]`
- `DELETE /api/prizes/[id]`

Server logic:

- validate payloads with Zod
- generate IDs on create
- enforce expiration date validity
- prevent reducing `limit` below current `usage`
- prevent deleting prizes that already have usage

### Room Setup

Room prize tiers can enter the room in two ways:

1. During room creation from `src/routes/+page.svelte`
2. During lobby-only editing from `src/routes/host/[roomId]/+page.svelte`

Server entry points:

- `host:create` in `src/lib/server/socket/handlers.ts`
- `host:set_room_prize_config` in `src/lib/server/socket/handlers.ts`

Rules:

- room prize config is optional even when the feature is enabled
- room prize config can be edited only while room state is `Lobby`
- once the quiz starts, prize config is frozen

### Eligibility

At the end of the game, the player state serializer may attach a
`prizeClaimToken`.

Files:

- `src/lib/server/socket/serializers.ts`
- `src/routes/api/prizes/eligibility/+server.ts`
- `src/lib/server/prizes/service.ts`

Eligibility checks:

- feature enabled
- room exists
- room state is `End`
- player exists
- signed token matches room, player, score, quiz, and `startedAt`
- best matching room tier exists
- referenced prize exists, is active, and is not expired
- player has not already claimed in that room

### Claim

Claim endpoint:

- `POST /api/prizes/claim`

Claim behavior:

- re-validates signed token
- resolves best eligible tier
- enforces one claim per player per room
- checks prize availability against `limit` and `usage`
- increments usage
- writes redemption record
- returns revealed prize URL to the client

### Optional Email Send

Endpoint:

- `POST /api/prizes/send-email`

Behavior:

- available only when prize email is enabled and transport is configured
- sends the already-claimed prize URL once on demand
- does not store the email address for recovery
- updates redemption status to reflect email send

---

## Token Security

Prize claim protection is based on a signed token generated from:

- `roomId`
- `playerId`
- `finalScore`
- `quizFilename`
- `startedAt`

Implementation:

- `createPrizeClaimToken()`
- `verifyPrizeClaimToken()`

Signing secret:

- `config.adminPasswordHash`, falling back to `HOST_PASSWORD` when needed

This prevents a player from manually claiming another player’s prize by
guessing identifiers or posting a forged request.

---

## UI Integration

### Settings

File:

- `src/routes/settings/+page.svelte`

Responsibilities:

- enable or disable prize feature
- enable or disable prize email support
- manage default room prize config
- manage prize CRUD
- display prize cards read-only by default with edit toggle

### Room Creation

File:

- `src/routes/+page.svelte`

Responsibilities:

- load available prize options
- apply default prize config if present
- allow optional room-level tiers before room creation
- optionally save the current setup as the new default

### Host Lobby

File:

- `src/routes/host/[roomId]/+page.svelte`

Responsibilities:

- show room prize config in a modal
- allow lobby-only edits
- persist edits through `host:set_room_prize_config`

### Player End Screen

File:

- `src/routes/play/[roomId]/+page.svelte`

Responsibilities:

- request eligibility at end-of-game
- show claim CTA when eligible
- reveal prize URL after claim
- optionally send email immediately
- keep the prize visible after successful claim with no server-side
  recovery promise

---

## Important Runtime Details

### Shared Room State

The prize eligibility and claim APIs depend on live in-memory room state.

To keep HTTP endpoints and Socket.IO handlers reading the same room map,
`src/lib/server/game/rooms.ts` uses a process-global store on
`globalThis`.

This avoids split in-memory state between the socket server and HTTP
route modules.

### Player Timer Fix

The prize work added end-of-game behavior to the player page, but a later
bugfix was also required there:

- `src/routes/play/[roomId]/+page.svelte`

The player countdown now keeps `clockOffsetMs` synced only from
authoritative server snapshots so optimistic answer updates do not rewind
the visible timer.

---

## Current Constraints

- No database.
- No stored email recovery flow.
- Prize email SMTP runtime uses UI-managed file-backed config, not `.env`.
- No post-start host edits to prize config.
- Prize assignment is per room/game, not per quiz file.
- Email delivery is send-only and optional.
- Prize visibility after claim remains client-side; losing it later is not
  recoverable by design.

## Operational Handling

- `data/secrets.json` must stay ignored by git.
- Secret values must not be returned by Settings reads.
- Secret values must not appear in logs, diagnostics, or support tooling.
- Backups that restore prize email capability must include both
  `data/config.json` and `data/secrets.json`.

---

## Main Files

### Shared types

- `src/lib/types/prizes.ts`
- `src/lib/types/game.ts`

### Server

- `src/lib/server/prizes/schema.ts`
- `src/lib/server/prizes/store.ts`
- `src/lib/server/prizes/service.ts`
- `src/lib/server/config.ts`
- `src/lib/server/game/rooms.ts`
- `src/lib/server/socket/handlers.ts`
- `src/lib/server/socket/serializers.ts`
- `src/lib/server/socket/broadcast.ts`

### Routes

- `src/routes/api/prizes/+server.ts`
- `src/routes/api/prizes/[id]/+server.ts`
- `src/routes/api/prizes/options/+server.ts`
- `src/routes/api/prizes/eligibility/+server.ts`
- `src/routes/api/prizes/claim/+server.ts`
- `src/routes/api/prizes/send-email/+server.ts`
- `src/routes/api/settings/+server.ts`

### UI

- `src/lib/components/prizes/PrizeTierEditor.svelte`
- `src/routes/settings/+page.svelte`
- `src/routes/+page.svelte`
- `src/routes/host/[roomId]/+page.svelte`
- `src/routes/play/[roomId]/+page.svelte`

### Tests

- `tests/prizes.test.ts`
- `tests/realtime-patches.test.ts`

---

## Summary

The prize feature is implemented as an isolated file-backed subsystem
inside the main app. It stays behind an app-level feature flag, uses
room-level tier assignment, validates claims with signed player tokens,
persists prize inventory and redemptions without a database, and exposes
only minimal integration points into room setup, host lobby editing, and
the player end-of-game flow.
