# API Reference

Base URL: `http://127.0.0.1:4318/api` (dev web proxies `/api` to this port).
Auth: `tp_session` HttpOnly cookie + `x-csrf-token` header for non-GET requests.

## Authentication

### `POST /auth/register`
Register first account (becomes owner). Body: `{ name, email, password, workspaceName }`.
Returns `{ user, workspace, entitlements, csrfToken }`.

### `POST /auth/login`
Login. Body: `{ email, password }`. Returns same shape as register.

### `POST /auth/logout`
Clear session. Requires auth.

### `GET /auth/me`
Current session. Returns `{ user, workspace, entitlements, csrfToken }`.

## Workspace

### `GET /workspace`
Workspace profile. Requires auth.

### `PATCH /workspace`
Update workspace (qa_lead+). Body: `{ name, ... }`.

### `POST /workspace/members`
Add member (admin+). Body: `{ email, role }`.

### `GET /workspace/token`
Create/revoke workspace API token for CI (admin+).

## Projects

### `GET /projects`
List workspace projects.

### `POST /projects`
Create project (tester+). Body: `{ name, ... }`.

### `DELETE /projects/:id`
Delete project (admin+).

## Suites & Cases

### `GET /suites` / `POST /suites`
List / create test suites (create: tester+).

### `GET /cases` / `POST /cases` / `PATCH /cases/:id` / `DELETE /cases/:id`
CRUD for test cases. Create/patch: tester+; delete: qa_lead+.

## Runs

### `GET /runs`
List runs (filter by `projectId`, `limit` max 200).

### `POST /runs`
Trigger a run (tester+).
- Automated: `{ projectId, suiteId?, caseIds?, trigger? }` → `202`
- Manual: `{ projectId, suiteId?, caseIds?, mode: "manual", assignee?, force? }` → `201` with a draft run whose results are `not-run`.
Returns `409` with `{ runId }` when an active manual run already exists for the same project, suite and tester.

### `POST /runs/:id/start` · `pause` · `resume`
Manual run state transitions (tester+). Invalid transitions return `409`.

### `POST /runs/:id/results/:caseId`
Record a manual result (tester+). Body:
`{ status: "passed" | "failed" | "blocked" | "skipped" | "not-run", actualResult?, notes?, attachments?: string[], durationMs? }`.
Recomputes the run summary and stamps `executedBy` / `executedAt`. Closed runs return `409`.

### `POST /runs/:id/complete`
Close a manual run (tester+). Fails with `400` while any case is `not-run`. Final status is `failed` if any failure exists, otherwise `blocked` if any blocked case exists, otherwise `passed`.

### `POST /runs/:id/cancel`
Cancel an automated or manual run (tester+). Manual runs preserve recorded results.

### `GET /runs/history`
Filtered, paginated history. Query: `projectId`, `suiteId`, `status`, `mode` (`automated|manual`), `q`, `from`, `to`, `sort` (`newest|oldest|duration`), `page`, `pageSize` (5–100). Returns `{ items, total, page, pageSize, pages }`.

### `GET /cases/:id/history`
Per-case execution history (latest 50). Remains readable after the case is deleted because it is derived from stored run results.

### `GET /runs/:id/stream`
SSE stream of automated run progress.

## Schedules & Workflows

### `GET /schedules` / `POST /schedules` / `PATCH /schedules/:id` / `DELETE /schedules/:id`
Schedule recurring suite execution (qa_lead+).

### `GET /workflows` / `POST /workflows` / `POST /workflows/:id/run`
Multi-step workflows with retry, parallelism, timeouts (qa_lead+ to create; tester+ to run).

## AI

### `GET /ai/providers`
Configured AI providers.

### `POST /ai/chat` / `POST /ai/generate-cases` / `POST /ai/analyze-run` / `POST /ai/plan`
AI assistant endpoints (auth; generate-cases/agent-run: tester+).

### `GET /ai/agents` / `POST /ai/agents/:id/run`
Agent workforce (run: tester+).

### `GET /ai/approvals` / `POST /ai/approvals/:id`
Pending approvals and approve/reject (qa_lead+).

## AI Benchmarks

Base path: `/api/ai/benchmarks`. Methodology: `docs/AI_BENCHMARK_METHODOLOGY.md`.

### `GET /ai/benchmarks/suites`
The 7 fixture-driven suite definitions: `{ id, name, capability, description, measures }`.

### `POST /ai/benchmarks/run`
Run suites against the active AI provider (tester+). Body: `{ label?, suiteIds? }`.
Returns `201` with the completed `BenchmarkRun` (status, configHash, per-suite metrics, latency p50/p95/p99, resource deltas, notes). `409` when the selected provider is unconfigured (never scores an untested target).

### `GET /ai/benchmarks/runs`
Paginated append-only history for the workspace. Query: `page`, `pageSize` (5–50). Returns `{ items, total, page, pageSize, pages }`.

### `GET /ai/benchmarks/runs/:id`
Full run detail (includes per-case results). `404` for other workspaces' runs.

### `GET /ai/benchmarks/runs/:id/export?format=json|csv`
Download a run as JSON or a flat CSV (`run_id,started_at,target_kind,target_model,suite_id,metric,value,cases,errors,avg_latency_ms`).

### `GET /ai/benchmarks/leaderboard`
Weighted score over the latest completed run per target. Returns `{ entries, weights, formula, winnerDeclared, note }`. A winner is declared only when ≥ 2 distinct targets have completed runs.

### `POST /ai/benchmarks/compare`
Compare two runs (auth). Body: `{ a, b }` (run ids). `409` when the runs used different benchmark configurations (configHash mismatch) — prevents false regressions. Returns overall + per-suite deltas and a `regression` flag.

## Tools

### `GET /collections` / `POST /collections` / `POST /collections/:id/send`
API request collections and send.

### `GET /performance` / `POST /performance`
Bounded load test plans and results.

### `GET /security` / `POST /security/scan`
Passive security header scan.

### `GET /integrations` / `PATCH /integrations/:id` / `POST /integrations/:id/test`
Integration configuration (webhooks, CI token). Connections are configured, not faked.

### `GET /reports` / `POST /reports/generate` / `GET /reports/:id/export`
Report generation and CSV/JSON export.

### `POST /billing/plan`
Simulated plan switching (owner+). No payment provider contacted.

## CI Hook

### `POST /hooks/run`
Bearer workspace token auth. Triggers a run for a project/suite. Returns `{ runId, statusUrl }`.

## Public

### `GET /public/score`
Workspace public health score (no auth).

### `GET /api/health`
Server health: `{ status, product, version, uptimeSeconds, storage, ai }`.
