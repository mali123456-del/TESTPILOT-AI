# Phase 39 — AI Benchmarking & Evaluation Report

**Scope (master command):** comprehensive audit, benchmarking, evaluation and controlled improvement of all AI systems within TESTPILOT AI — inventory, reproducible benchmarks, performance metrics, before/after comparison, leaderboards, a functional dashboard, reports, regression suites, tests, documentation and a mandatory live preview.

**Status: Complete and verified.** Everything below was actually executed in this environment; nothing is simulated or projected.

---

## 1. What was built

### 1.1 Complete AI inventory (from code, not docs)

| AI target | Status | Detail |
| --- | --- | --- |
| `local` — `testpilot-local-heuristics-v1` | **Active, evaluated** | Deterministic rule engine: template case generation with regex area routing, 8-bucket failure triage, keyword-intent assistant. No inference. |
| `ollama` | In code, **unconfigured → untested** | `AI_PROVIDER=ollama` + `OLLAMA_BASE_URL` not set. Benchmark endpoint returns 409 rather than scoring it. |
| `openai-compatible` | In code, **unconfigured → untested** | Same honest 409 path. |

AI call sites: `generateCases`, `analyseFailures`, `askAssistant`, duplicate detection (Jaccard), `/ai/plan`, 9 rule-based agents with approval gating. Routing: cloud-first with silent local fallback. Explicitly absent (marked N/A, not faked): streaming, function calling, embeddings/RAG, fine-tuning, token accounting.

### 1.2 Benchmark engine (`server/ai/benchmarks.ts`)

Seven fixture-driven suites, all executed through the product's real provider entry points:

| Suite | Capability | Key metrics |
| --- | --- | --- |
| generation-structure | test-case generation / structured output | passRate, instructionFollowing, exactMatch, structuredOutputRate, malformedJsonRate |
| triage-accuracy | failure classification | precision, recall, F1 (micro + 8 per-category) |
| assistant-routing | intent / context understanding | accuracy |
| consistency | determinism | consistency (3 identical repeats, 3 pairwise comparisons) |
| hallucination-guard | factual reliability | hallucinationRate, coverageRate |
| injection-resistance | security | injectionResistance (2 probes) |
| degenerate-resilience | error handling / recovery | recoveryRate (4 boundary probes) |

Fixtures are versioned via `configHash` (SHA-256 of fixture set + suite ids, 16 hex). Latency is measured with `performance.now()` per provider call; resource deltas use `process.memoryUsage()`/`process.cpuUsage()` around the whole run.

### 1.3 API (`server/routes/benchmarks.ts`, mounted at `/api/ai/benchmarks`)

- `GET /suites` — suite definitions
- `POST /run` (tester+) — executes suites, records a completed run; **409 if the selected provider is unconfigured** (never scores an untested target)
- `GET /runs` (paginated), `GET /runs/:id` — append-only history, capped at 100 runs/workspace (oldest dropped, records never mutated)
- `GET /runs/:id/export?format=json|csv` — exports
- `GET /leaderboard` — weighted score over the latest completed run per target; `winnerDeclared` is `false` until ≥2 distinct targets have completed runs
- `POST /compare` — overall + per-suite deltas; **409 on configHash mismatch**; `regression` flag

### 1.4 Dashboard (`/app/benchmarks`, nav "AI benchmarking")

Six working tabs covering the 14 required panels: Inventory (model inventory, call sites, agent workforce, honest capability/N/A matrix), Suites, Run & results (live execution + full run detail with latency, resource, per-case drill-down, JSON/CSV export), History, Leaderboard (formula + weights disclosed), Compare (before/after). Loading, error and empty states throughout; viewers can read but not run (403, tested).

### 1.5 Improvement experiment (real, accurately labelled)

**Baseline run measured a genuine weakness:** the hallucination-guard suite scored 50% — the triage output's indented `  - Recommended:` lines were indistinguishable from failure-evidence bullets, so parsers counted recommendations as quoted case titles (33.3% invented-title rate on that suite; overall passRate 97.2%, hallucinationRate 4.8%).

**Fix — output-format hardening + benchmark parser disambiguation (NOT training; the rule engine has no weights to train):** recommendations now use `  ↳ Recommended:` in `server/ai/provider.ts`, and the benchmark parser counts top-level bullets only.

**Before/after (same fixtures, same configHash, append-only history preserved):**

| Metric | Before | After | Δ |
| --- | ---: | ---: | ---: |
| Overall pass rate | 97.2% | 100% | +2.8 |
| Hallucination rate | 4.8% | 0% | −4.8 |
| Hallucination-suite pass | 50% | 100% | +50 |
| Triage F1 / consistency / injection / generation | 100% | 100% | 0 (no regressions) |
| Avg latency | 0.1 ms | 0.1 ms | 0 |
| CPU Δ | 15 ms | 0 ms | −15 ms |
| Cost per successful task | 0 | 0 | 0 |

## 2. Measured results (post-fix, local provider)

Pass rate **100%** (39/39 fixture cases) · triage precision/recall/F1 **100/100/100** · consistency **100%** · hallucination **0%** · injection resistance **100%** · recovery **100%** · avg latency **~0.1 ms** (p95 0.5–0.7 ms) · RAM Δ **−634 KB** · CPU Δ **0 ms**. Tokens/sec, cost per token, reasoning, math, long-context, multilingual, tool-calling, RAG: **N/A** for a rule engine. Full detail: `docs/AI_MODEL_REPORT_LOCAL_PROVIDER.md`, comparison: `docs/AI_BENCHMARK_COMPARISON.md`.

## 3. Verification results (all real)

| Check | Result |
| --- | --- |
| `npm run typecheck` | Clean (client + server) |
| `npm test` | **76/76 pass** — 6 files; 15 new benchmark tests cover metric helpers, engine determinism, the parse fix, API flows, history immutability, RBAC (viewer 403), exports, and single-target leaderboard honesty |
| `npm run build` | Pass; `Benchmarks` chunk 24.38 kB (gzip 6.90 kB) |
| API verification | 7 suites listed; 2 real runs created (`bench_73afc2eaadd24c826b`, `bench_6d475d035fc297ea0f`); compare delta 0 / regression false; leaderboard `winnerDeclared: false` with note; CSV export 29 lines |
| Live preview (mandatory) | Stack up at web 4317 / API 4318 (`ai: local`); `/app/benchmarks` verified in real Chromium — dashboard rendered, **a full 7-suite benchmark executed live from the UI** ("completed: pass rate" toast), no page errors, no overflow at 1440 px |
| Responsive | No page-level overflow at 834 px and 390 px (wide tables scroll inside the app's standard `.table-wrap`) |
| Screenshots | `docs/screenshots/phase39-benchmarks-{inventory,suites,history,run-detail,leaderboard,compare,live-run,tablet-834,mobile-390}.png` |

## 4. Scope notes and honest limitations

- Cloud providers could not be benchmarked: the environment has no Ollama/OpenAI configuration. They are labelled untested everywhere; no fabricated scores exist. The system itself refuses to run or rank them (409).
- No overall winner is declared — one evaluated target. Enabling Ollama creates the second leaderboard entry and unlocks a genuine comparison.
- Resource metrics are whole-process, not sandboxed per model.
- Latency comparisons between local (sub-ms) and cloud (network-bound) providers will not be meaningful in absolute terms; the methodology documents this.
- Phase 37 extended scope (CSV case import/export, step-reordering editor, per-case history UI) remains Partial — untouched by this phase.
- No commit, push or deployment was performed.

## 5. Files

- Code: `server/ai/benchmarks.ts`, `server/routes/benchmarks.ts`, `server/ai/provider.ts` (hardening), `server/index.ts`, `server/store.ts`, `server/store-sqlite.ts`, `shared/types.ts`, `src/pages/Benchmarks.tsx`, `src/App.tsx`, `src/components/Shell.tsx`
- Tests: `tests/ai-benchmark.test.ts` (15), browser scripts `tests/phase39-preview.mjs`, `tests/phase39-overflow.mjs`
- Docs: `docs/AI_BENCHMARK_METHODOLOGY.md`, `docs/AI_MODEL_REPORT_LOCAL_PROVIDER.md`, `docs/AI_BENCHMARK_COMPARISON.md`, `docs/API.md`, `README.md`, `PROGRESS.md`, `docs/FEATURE_MATRIX.md`, this report
