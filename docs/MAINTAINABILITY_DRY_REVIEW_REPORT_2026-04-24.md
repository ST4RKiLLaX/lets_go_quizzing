# Maintainability and DRY Review Report

Date: 2026-04-24
Scope: Entire repository (`/home/juan/lets_go_quizzing`)
Review style: Architecture-layered phases

## Review Constraints Used

- Hotspots first, adjacent-module sampling only where needed.
- DRY extraction threshold applied: same behavior, lifecycle, and failure semantics.
- Protect-before-refactor rule applied for risky paths.
- Non-goals respected: no behavior changes, no rewrite campaign, no abstraction for abstraction's sake.

## Phase 1: Architecture Boundaries and Module Sizing

### Finding A1
- Severity: major
- Location: `src/lib/server/socket/handlers.ts`
- Problem: Large multi-domain orchestration module (`1193` LOC) combines host session, host game flow, waiting room, player flow, projector flow, and disconnect behavior.
- Why it matters: High cognitive load and broad blast radius for changes.
- Recommended fix: Split by lifecycle domain into focused modules while retaining one aggregator entrypoint.
- Risk of fixing: medium
- Suggested tests: Characterization coverage for socket lifecycle and event wiring before extraction.

### Finding A2
- Severity: major
- Location: `src/routes/play/[roomId]/+page.svelte`
- Problem: Very large role page (`1301` LOC) mixing join/register transport behavior, timer lifecycle, prize flow, and UI orchestration.
- Why it matters: Hard to reason about local changes; easier to regress unrelated behavior.
- Recommended fix: Keep page as orchestration shell; extract pure helpers first, then small lifecycle utilities.
- Risk of fixing: medium-high
- Suggested tests: Characterization tests for join/denial/waiting transitions, timer behavior, and prize flow.

### Finding A3
- Severity: major
- Location: `src/routes/host/[roomId]/+page.svelte`, `src/routes/settings/+page.svelte`
- Problem: Large route modules (`889` and `982` LOC) carry mixed concerns.
- Why it matters: Reduced traceability and reviewability.
- Recommended fix: Gradual decomposition by responsibility boundaries, keeping visible flow in page files.
- Risk of fixing: medium
- Suggested tests: Route-level behavior checks for key flows before and after extraction.

## Phase 2: Backend/API DRY Violations

### Finding B1
- Severity: major
- Location: `src/routes/api/quizzes/**`
- Problem: Repeated host/auth checks and repeated unauthorized responses across multiple handlers.
- Why it matters: Policy drift risk and repetitive edits.
- Recommended fix: Introduce small explicit helper `requireHostAuth(event)` returning `Response | null`.
- Risk of fixing: low-medium
- Suggested tests: Table-driven auth gate tests across affected endpoints.

### Finding B2
- Severity: major
- Location: `src/routes/api/prizes/+server.ts`, `src/routes/api/prizes/[id]/+server.ts`
- Problem: Duplicate `ensureAuthorized` logic with same semantics.
- Why it matters: Direct DRY violation with potential behavior divergence.
- Recommended fix: Shared helper in prize route-support module.
- Risk of fixing: low
- Suggested tests: Keep exact 401/404 semantics across both endpoints.

### Finding B3
- Severity: major
- Location: `src/routes/api/prizes/claim/+server.ts`, `src/routes/api/prizes/eligibility/+server.ts`
- Problem: Duplicate claim context parsing and token verification pipeline (`roomId`, `playerId`, `token`, room/player lookup, `verifyPrizeClaimToken`).
- Why it matters: Security-sensitive duplication can drift.
- Recommended fix: Shared claim token/context parser/validator.
- Risk of fixing: medium
- Suggested tests: Token invalid, missing room/player, and valid-path parity tests on both routes.

### Finding B4
- Severity: minor
- Location: Multiple API routes under `src/routes/api/prizes/**`, `src/routes/api/settings/**`
- Problem: Repeated error-shaping pattern (`error instanceof Error ? ...`).
- Why it matters: Error format inconsistency risk and duplication.
- Recommended fix: Small explicit `jsonError(status, code, message)` utility.
- Risk of fixing: low
- Suggested tests: Error contract tests for representative routes.

### Finding B5
- Severity: major
- Location: `src/routes/api/settings/+server.ts`
- Problem: Large mixed-concern `PUT` with extensive parse/validate/update logic in one function.
- Why it matters: Hard to evolve safely.
- Recommended fix: Extract pure parse and validation helpers, keep route as coordinator.
- Risk of fixing: medium
- Suggested tests: Matrix tests for valid updates and boundary validation errors.

## Phase 3: Frontend/State DRY Violations

### Finding C1
- Severity: major
- Location: `src/routes/play/[roomId]/+page.svelte`, `src/routes/host/[roomId]/+page.svelte`, `src/routes/projector/[roomId]/+page.svelte`
- Problem: Repeated timer/countdown lifecycle logic (clock offset, timer end derivation, countdown setup/teardown).
- Why it matters: Timer fixes must be synchronized across three role pages.
- Recommended fix: Extract pure timer derivation helpers first; add small lifecycle utilities only where semantics are truly shared.
- Risk of fixing: medium
- Suggested tests: Timer parity tests across role pages and state transitions.

### Finding C2
- Severity: major
- Location: Same role pages above
- Problem: Repeated socket listener triad and patch handling (`state:update`, `room:patch`, `question:patch`) with similar semantics.
- Why it matters: Drift risk in realtime behavior.
- Recommended fix: Share pure patch transition helper(s) while keeping page-specific wiring explicit.
- Risk of fixing: medium-high
- Suggested tests: Realtime transition and question patch carry-over characterization tests.

### Finding C3
- Severity: minor
- Location: `src/routes/+page.svelte`, `src/routes/host/[roomId]/+page.svelte`
- Problem: Duplicated `getRoomPrizeTierDisabledReason` behavior with message-text variance.
- Why it matters: Small but avoidable drift risk.
- Recommended fix: Share decision logic via reason code; map to context-specific user message at call site.
- Risk of fixing: low
- Suggested tests: Reason-code coverage for empty/claimed/available prize sets.

### Finding C4
- Severity: major
- Location: `src/lib/components/player/PlayerQuestionForm.svelte`
- Problem: Very broad component interface with many props/callbacks.
- Why it matters: Tight coupling and fragile parent/component contracts.
- Recommended fix: Group props into typed contexts (submission, drafts, handlers) before deeper splits.
- Risk of fixing: medium
- Suggested tests: Contract tests by question type and submission mode.

### Finding C5
- Severity: nice-to-have
- Location: `src/lib/components/host/HostOpenEndedRevealModeration.svelte`, `src/lib/components/host/HostWordCloudRevealModeration.svelte`
- Problem: Repeated visible/blocked submission derivation.
- Why it matters: Small maintenance overhead.
- Recommended fix: Extract pure submission-filter helper.
- Risk of fixing: low
- Suggested tests: Unit tests for filtering/count behavior.

## Phase 4: Test Architecture and Guardrails

### Finding D1
- Severity: blocker (for risky refactors)
- Location: `src/lib/server/socket/handlers.ts` coverage gap
- Problem: No direct integration-level test guard around socket orchestration.
- Why it matters: High-risk refactors lack safety net.
- Recommended fix: Add minimal integration suite for host/player/projector lifecycle and patch propagation.
- Risk of fixing: medium
- Suggested tests: End-to-end socket state transition and room patch propagation checks.

### Finding D2
- Severity: major
- Location: `tests/prizes.test.ts`, `tests/settings-smtp.test.ts`, `tests/quiz-image-import.test.ts`, `tests/secret-store.test.ts`
- Problem: Duplicated temp-dir, `chdir`, teardown, and cookie helper patterns.
- Why it matters: Harness updates require repeated edits and can diverge.
- Recommended fix: Shared test helper module(s) for fs-isolation and auth cookie setup.
- Risk of fixing: low-medium
- Suggested tests: One helper-focused test and migration of 1-2 suites first.

### Finding D3
- Severity: major
- Location: `e2e/app.spec.ts`, `e2e/play.spec.ts`
- Problem: E2E tests are smoke-level only.
- Why it matters: Critical user flows are not protected before refactors.
- Recommended fix: Add one high-value scenario per role first (host, player, projector/prize).
- Risk of fixing: medium
- Suggested tests: Host starts game, player answers, eligibility/claim path visibility.

### Finding D4
- Severity: minor
- Location: `vite.config.ts` and tests import conventions
- Problem: `globals: true` config plus explicit imports creates style inconsistency.
- Why it matters: Minor maintainability and onboarding friction.
- Recommended fix: Standardize one style and enforce.
- Risk of fixing: low
- Suggested tests: None (style/config consistency).

## Phase 5: Consolidated Remediation Roadmap

### Quick Wins
1. Extract shared prize admin authorization helper.
2. Add small `jsonError` response utility for repeated error shapes.
3. Normalize import hygiene in large route files where clearly inconsistent.
4. Create shared test harness helper(s) for fs-isolation and auth cookie creation.

### Medium Lifts
1. Shared claim token/context validator for claim + eligibility endpoints.
2. Shared host auth gate helper for quiz/image mutation routes.
3. Shared pure timer derivation helper for role pages.
4. Add characterization tests for socket lifecycle and prize claim behavior.

### Larger Moves
1. Split socket handler orchestration into lifecycle-focused modules.
2. Decompose oversized role pages using shell + focused helpers.
3. Reduce `PlayerQuestionForm` contract breadth using typed grouped props.
4. Thin `settings` API mutation orchestration by extracting parse/validate layers.

## Preserve These Strengths

- Realtime patch utility centralization: `src/lib/utils/realtime-patches.ts`
- Toast architecture with store/system separation: `src/lib/stores/toast-system.ts`
- Hardened URL import path checks: `src/routes/api/quizzes/images/import-url/+server.ts`
- Auth hardening approach: `src/lib/server/auth/index.ts`

