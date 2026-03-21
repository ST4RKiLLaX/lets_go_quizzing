# Code Review Strategy

This document summarizes the focused code review completed in 2025 and the strategy for future improvements. See [.cursorrules](../.cursorrules) for error-handling and DRY principles.

## No Broad Refactor

We do **not** do a broad refactor. The goal is to reduce risk, improve consistency, and make future changes easier. Changes are incremental and targeted.

---

## Completed (Phase 1–2)

### Phase 1: Quick Wins

- **History API:** Replaced silent `catch { return json([]) }` with explicit error logging and 500 response. Aligns with .cursorrules Section 2 (No Silent Fallbacks).
- **ESLint + Prettier:** Added `eslint.config.js`, `.prettierrc`, `.prettierignore`. Scripts: `npm run lint`, `npm run format`, `npm run format:check`. Relaxed some rules (unused vars, etc.) to warnings for first pass.
- **Auth imports:** Standardized on `$lib/server/auth.js` everywhere. Added `createLogoutCookie` to barrel export.

### Phase 2: Auth Consistency

- **JSDoc:** Documented `requireHostAuth` and `requireHostPassword` in `src/lib/server/auth/index.ts`.
- **jsonWithCookie helper:** Added `src/lib/server/response.ts` with `jsonWithCookie(data, cookie)`. Replaced manual `new Response(JSON.stringify(...))` in login, logout, setup, and settings PUT.

### DRY: Quiz list, players sort, leaderboards

Incremental refactors (shared utilities and components):

| Item | Location | Role |
|------|----------|------|
| `QuizListItem` + `listQuizItems()` | `src/lib/types/quiz-list.ts`, `src/lib/server/quiz-list.ts` | Single builder for home and creator quiz lists |
| `sortPlayersByScore()` | `src/lib/utils/players.ts` | Consistent descending score order (host sidebar, host/projector/play leaderboards) |
| `LeaderboardPlayerList` | `src/lib/components/shared/LeaderboardPlayerList.svelte` | Shared rank / emoji / name / score rows |
| `SessionLeaderboardView` | `src/lib/components/shared/SessionLeaderboardView.svelte` | Projector + play scoreboard/end card (replaces duplicate projector/player views) |
| `HostLeaderboardView` | `src/lib/components/host/HostLeaderboardView.svelte` | Uses `LeaderboardPlayerList`; keeps host-only actions (New Game, Next) |

**Possible next steps:** question-type label/reminder constants out of `host/[roomId]/+page.svelte`; thin auth `fetch` helpers for `/api/auth/check` and login.

---

## Large-File Split Strategy (Phase 3 — Define Only)

Implementation deferred. Strategy documented for future work.

### socket.ts (~1,065 lines)

| New file                               | Contents                                                                               | Est. lines |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ---------- |
| `src/lib/server/socket/serializers.ts` | `serializeSubmissions`, `serializeState`, `serializeHostState`, `serializePlayerState` | ~95        |
| `src/lib/server/socket/broadcast.ts`   | `broadcastStateToRoom`                                                                 | ~25        |
| `src/lib/server/socket/history.ts`     | `saveHistory`                                                                          | ~30        |
| `src/lib/server/socket/handlers.ts`    | All `socket.on(...)` handlers (host, player, projector, disconnect)                    | ~800       |
| `src/lib/server/socket.ts`             | `initSocket`, `getCorsOrigin`, `logHostAuthFailure`, wire handlers                     | ~100       |

**Handler grouping:** Host events, player events, projector events, disconnect.

### QuizEditor.svelte (~966 lines)

| Extraction               | Contents                                                                                                                         | Rationale                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `QuizEditorActions.ts`   | Pure functions: `addRound`, `removeRound`, `addQuestion`, `removeQuestion`, `setQuestionType`, `addOption`, `removeOption`, etc. | Reduces script size; easier to unit test          |
| `QuestionForm.svelte`    | Renders one question's form by `question.type`. Props: `question`, `roundIndex`, `questionIndex`, `onUpdate`                     | Shrinks template; each question type in one place |
| Keep `QuizEditor.svelte` | Mode toggle, round list, `QuestionForm` usage, save, image upload                                                                | Orchestration only                                |

---

## Out of Scope (For Now)

- Splitting socket.ts or QuizEditor.svelte (strategy only)
- Adding Vitest or Playwright
- Changing auth logic or security model
