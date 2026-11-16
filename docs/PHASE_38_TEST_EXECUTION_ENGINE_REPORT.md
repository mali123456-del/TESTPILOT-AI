# Phase 38 — Test Execution Engine Report

**Status:** COMPLETE (implemented, tested and verified in a live browser)
**Scope:** Manual execution workspace, run lifecycle, result recording, execution history.

## 1. What already existed

- Automated runs via the orchestrator (`queued → running → passed/failed/error/cancelled`) with SSE updates.
- Real runners for unit, API, accessibility, visual, DB-integrity, load and security checks.
- Retry-failed and cancel for automated runs.
- Run list endpoint (`GET /runs?limit=`) and detail endpoint.

These were preserved. No automated behaviour was replaced.

## 2. What was added

### Data model (`shared/types.ts`)

- `ResultStatus` extended with `not-run` and `blocked`.
- `RunResult` gained `actualResult`, `notes`, `attachments[]`, `executedBy`, `executedAt`.
- `Run` gained `mode: 'automated' | 'manual'`, `assignee`, `pausedAt`, `resumedAt`, and statuses `draft`, `paused`, `blocked`, `completed`.
- Summary gained optional `blocked` and `notRun` counts.

### Backend (`server/routes/runs.ts`, `server/routes/core.ts`, `server/index.ts`)

- Manual draft creation with project/workspace validation and a duplicate active-run guard (HTTP 409 + existing run id).
- State machine: start, pause, resume, complete, cancel. Every transition is validated; invalid transitions return 409.
- Result recording with Zod-validated status, actual result, notes, evidence links and duration; summary recomputed server-side; tester identity and timestamp recorded.
- Completion requires every case to have a result; final status derives from failures/blocked cases.
- `GET /runs/history` with server-side filtering (project, suite, status, mode, text, date range, sort) and pagination.
- `GET /cases/:id/history` for per-case execution history, preserved after case deletion.
- Startup recovery: automated runs left `running` are marked `error`; manual runs are marked `paused` so testers can resume.

### Frontend

- New route `/app/runs/:runId/execute` → `src/pages/ExecutionWorkspace.tsx`.
- Execution center (`src/pages/Runs.tsx`) rebuilt around server-side history: search, status/mode/project filters, sort, pagination, manual/automated labels, and an "Open workspace" action.
- New-run modal now offers Automated vs Manual, optional assignee and case selection.
- Workspace: case list with status, case details (description, steps, expected, tags), result form (actual result required for Fail/Blocked), notes, evidence links, Pass/Fail/Blocked/Skip, reset, previous/next, arrow-key navigation, 5-second polling while running, unsaved-change confirmation and `beforeunload` protection, live progress and duration, and per-case history.
- Read-only rendering for completed/cancelled runs (no dimmed disabled textareas).
- Badge labels now render `not-run` as "not run" and map new statuses to tones.

## 3. Files

**Created**
- `src/pages/ExecutionWorkspace.tsx`
- `tests/manual-execution.test.ts`
- `tests/phase38-preview.mjs`
- `docs/PHASE_38_TEST_EXECUTION_ENGINE_REPORT.md`
- `docs/screenshots/phase38-workspace-desktop.png`
- `docs/screenshots/phase38-workspace-tablet.png`
- `docs/screenshots/phase38-workspace-mobile.png`
- `docs/screenshots/phase38-runs-desktop.png`
- `docs/screenshots/phase38-runs-mobile.png`
- `docs/screenshots/phase38-newrun-manual.png`

**Modified**
- `shared/types.ts`
- `server/routes/runs.ts`
- `server/routes/core.ts`
- `server/index.ts`
- `src/App.tsx`
- `src/pages/Runs.tsx`
- `src/components/ui.tsx`
- `README.md`
- `PROGRESS.md`
- `docs/FEATURE_MATRIX.md`
- `docs/API.md`
- `docs/PHASE_37_TEST_CASE_MANAGEMENT_REPORT.md` (corrected to Partial)

No dependencies were added.

## 4. API endpoints added/changed

| Method | Endpoint | Change |
| --- | --- | --- |
| POST | `/api/runs` | Accepts `mode`, `assignee`, `force`; manual branch |
| POST | `/api/runs/:id/start` | New |
| POST | `/api/runs/:id/pause` | New |
| POST | `/api/runs/:id/resume` | New |
| POST | `/api/runs/:id/results/:caseId` | New |
| POST | `/api/runs/:id/complete` | New |
| POST | `/api/runs/:id/cancel` | Manual-run branch added |
| GET | `/api/runs/history` | New (filtered + paginated) |
| GET | `/api/cases/:id/history` | New |

## 5. Verification (actual results)

| Command / check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | **61 passed / 0 failed**, 5 files |
| `npm run build` | Pass |
| Lint | No lint script is configured in `package.json` (`format:check` exists only); nothing to report |
| `npx playwright test tests/e2e/auth.spec.ts` | 2 passed / 2 failed — the preview server was started with `TESTPILOT_SEED=0`, so the demo credentials used by the spec do not exist, and repeated attempts then hit the login lockout. This is an environment mismatch, not a Phase 38 regression; the project's own Playwright workflow below authenticated successfully. |
| Live preview | `http://127.0.0.1:4317/app` — HTTP 200; API health returned `{"status":"ok","product":"TESTPILOT AI"}` |
| Browser workflow | Login → Execution center → New run (Manual) → Start → record Pass → Pause → Resume → Skip ×2 → Complete; status `Passed`, 3/3 executed, duration recorded |
| Case history | Displayed the earlier result, tester and timestamp |
| Responsive | Desktop 1440×900, tablet 834×1112, mobile 390×844; page overflow = false at all three |
| Console errors | None on the execution workspace |

The preview server was launched with a temporary `TESTPILOT_DATA_DIR` and `TESTPILOT_SEED=0`; a preview account (`preview@testpilot.local`) and sample project/cases were created there so the user's real workspace data was never modified.

New test coverage (`tests/manual-execution.test.ts`, 11 tests): draft creation, not-run results, duplicate guard, start/pause/resume, result recording with evidence, complete guard, blocked completion, closed-run rejection, filtered history, per-case history after deletion, viewer RBAC denial.

## 6. Known limitations

- Evidence is stored as reference links, not uploaded binaries.
- Manual runs poll every 5 seconds rather than using SSE.
- Completion requires a result for every selected case; there is no bulk "mark remaining skipped".
- Interrupted-run recovery is covered by startup logic but has no dedicated automated test (starting the server mid-run is not simulated in Vitest).
- Phase 37 extended features remain outstanding and are documented as Partial.

## 7. Git / deployment

No commit, push, branch deletion or deployment was performed. The preview server was started with a temporary data directory so the user's real workspace data was not modified.
