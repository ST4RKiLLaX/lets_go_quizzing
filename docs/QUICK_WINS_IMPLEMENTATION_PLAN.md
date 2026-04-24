# Quick Wins Implementation Plan

Scope: Apply low-risk, high-value maintainability and DRY improvements first.
Approach: Small explicit helpers, no behavior changes, and test-backed safety.

## Guardrails

- Keep helpers narrow and obvious; no mega wrappers.
- Do not change business behavior while extracting.
- Prefer characterization tests before touching high-risk call paths.
- Preserve traceability in route files (wiring visible, not hidden magic).

## Quick Win 1: Shared prize admin authorization helper

### Target
- `src/routes/api/prizes/+server.ts`
- `src/routes/api/prizes/[id]/+server.ts`

### Plan
1. Create `src/lib/server/prizes/route-guards.ts` with `ensurePrizeAdminAuthorized(cookie)`.
2. Move duplicate `isAuthenticated + isPrizeFeatureEnabled(loadConfig())` logic there.
3. Replace local duplicate functions in both route files.
4. Keep route outputs/status codes unchanged.

### Validation
- Run focused prize route tests.
- Add a small test case if needed to ensure unchanged 401/404 behavior.

### Effort
- Small

## Quick Win 2: Shared API error response helper

### Target
- Repeated error shape in:
  - `src/routes/api/prizes/+server.ts`
  - `src/routes/api/prizes/[id]/+server.ts`
  - `src/routes/api/prizes/claim/+server.ts`
  - `src/routes/api/prizes/send-email/+server.ts`
  - `src/routes/api/settings/prize-email-test/+server.ts`

### Plan
1. Create helper `src/lib/server/api-errors.ts`:
   - `toErrorMessage(error: unknown): string`
   - `jsonError(status: number, message: string, code?: string)`
2. Replace repeated catch blocks incrementally in the files above.
3. Keep existing status codes and message text behavior.

### Validation
- Run affected tests (`prizes`, `settings-smtp`, related API tests).
- Add one unit test for `toErrorMessage` formatting behavior.

### Effort
- Small

## Quick Win 3: Shared test helpers for fs isolation and auth cookie

### Target
- `tests/settings-smtp.test.ts`
- `tests/quiz-image-import.test.ts`
- `tests/secret-store.test.ts`
- `tests/prizes.test.ts`

### Plan
1. Add `tests/helpers/fs-isolation.ts`:
   - temp dir create/cleanup helpers
   - cwd restore helper
2. Add `tests/helpers/auth-cookie.ts`:
   - common session cookie helper
3. Migrate two tests first (`settings-smtp`, `quiz-image-import`) as pilot.
4. Migrate remaining matching files after pilot passes.

### Validation
- Run the migrated test files after each migration step.
- Run full test suite once all helper adoption is complete.

### Effort
- Small-medium

## Quick Win 4: Import hygiene cleanup in largest page file

### Target
- `src/routes/play/[roomId]/+page.svelte`

### Plan
1. Move mid-script import(s) into the top import block.
2. Keep logic and runtime behavior unchanged.
3. Avoid broader refactor in this step.

### Validation
- Run lint/typecheck for this file scope.
- Run existing player-related tests to ensure no regressions.

### Effort
- Very small

## Recommended Execution Order

1. Quick Win 1 (prize auth helper)
2. Quick Win 2 (API error helper)
3. Quick Win 3 (test helper consolidation)
4. Quick Win 4 (import hygiene)

Rationale:
- Start with clean backend duplication removals.
- Consolidate test harness before larger refactors.
- Keep UI touch last and minimal.

## Done Criteria

- Duplicate prize authorization logic removed from both prize routes.
- Shared API error utility used in all targeted repeated catch blocks.
- Repeated test fs/cookie setup reduced through shared helpers.
- Import hygiene fixed in target route file without behavior change.
- Tests/lint pass for touched scope.

