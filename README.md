# TESTPILOT AI

**Build Better. Test Smarter. Ship Confidently.**

TESTPILOT AI is a self-hosted, lightweight AI software-testing and QA workspace. It plans and organises tests, executes them, records real evidence, tracks defects and reports quality across unit, API, browser, accessibility, performance and security testing. Basic functionality works fully offline with a deterministic local AI provider; Ollama and OpenAI-compatible providers are optional.

> **Current build status:** Phase 41 (AI Orchestration, Intelligent Routing & Benchmark Automation) is implemented and verified. Other phases are marked honestly in [PROGRESS.md](PROGRESS.md) and the [feature matrix](docs/FEATURE_MATRIX.md). Nothing in this README is a marketing claim about unbuilt functionality.

---

## 1. Project overview

### What it is

A complete quality-engineering workspace combining:

- Test-case authoring and organisation (projects → suites → cases)
- Automated execution engines with real evidence
- A **manual execution workspace** for human testers (new in Phase 38)
- Execution history, filtering and per-case run history
- AI assistance (case generation, failure triage, defect drafting) with an approval gate
- API, performance, security and code-quality workspaces
- Reports, exports and team administration

### Problems it solves

- Test evidence is scattered across spreadsheets, ad-hoc scripts and chat threads.
- Manual test execution is rarely recorded with the same rigour as automation.
- Small teams cannot afford heavyweight enterprise test-management suites.
- AI features are often opaque or fabricate results; TESTPILOT AI labels AI output and never invents pass/fail evidence.

### Target users and use cases

- Solo developers and small QA teams validating a release
- QA engineers maintaining manual regression suites
- Teams needing lightweight API / performance / security smoke checks
- Self-hosters who want local data ownership with no mandatory cloud AI

### Product identity

**Tagline:** Build Better. Test Smarter. Ship Confidently.

---

## 2. Complete features

### Implemented and verified

| Area | Capability | Status |
| --- | --- | --- |
| Projects | CRUD, archive/restore, activity feed, settings, per-project metrics, search/sort/filter | Verified |
| Suites & cases | Create/edit/delete, priorities, tags, steps, expected results, enable/disable, bulk actions, version field | Verified (existing implementation) |
| Automated execution | Sandboxed unit runner, HTTP API runner, accessibility, visual, DB-integrity, bounded load, security-header engines, SSE live progress | Verified |
| **Manual execution (Phase 38)** | Draft manual runs, start/pause/resume/complete/cancel, per-case Pass/Fail/Blocked/Skip, actual result, notes, evidence links, previous/next navigation, unsaved-change protection, keyboard arrows, execution timer, duplicate-run guard, restart recovery | Verified |
| Run history | Server-side filters (project, status, mode, text), sorting, pagination, result drill-down, failure → defect creation | Verified |
| Per-case history | Previous executions per case, preserved after the case is edited or deleted | Verified |
| AI assistance | Case generation, run triage, duplicate clustering, agents and approvals using a local provider by default | Verified |
| **AI benchmarking (Phase 39)** | Complete AI inventory; 7 reproducible fixture-driven benchmark suites; live execution with real latency/CPU/RAM measurement; append-only history; before/after comparison with configHash guard; weighted leaderboard (formula disclosed, winner only with ≥2 targets); JSON/CSV exports | Verified |
| **AI Provider Management (Phase 40)** | AI Provider Center with add/edit/remove/enable/disable; model registry with discovery; secure credential management (encrypted at rest, masked in UI); connection testing; health monitoring; multi-model playground; intelligent routing; provider activity history; benchmark integration | Verified |
| Defects | CRUD with severity, status, links to failing runs/cases | Verified |
| API workspace | Saved requests, send + assertions, history | Verified |
| Performance / security | Bounded load tests, passive header scan | Verified |
| Reports | Quality/execution/defect reports, JSON/HTML/CSV export | Verified |
| Team & auth | scrypt passwords, HttpOnly sessions, CSRF, RBAC (owner/admin/qa_lead/tester/viewer), rate limiting, audit log | Verified |
| Storage | Atomic JSON store (default) and optional SQLite adapter with migration script | Verified |

### Partial or limited

- **Phase 37 Test Case Management:** the pre-existing case CRUD, bulk actions and version field work, but the fuller Phase 37 scope (CSV import/export, dedicated import-preview dialog, step-reordering editor, per-case history UI) is **not fully implemented**. See the corrected Phase 37 report.
- **Browser testing** requires an optional Playwright adapter; without it runs report `skipped` with the reason rather than faking a pass.
- **AI output** is labelled as assistance, never as verified diagnosis.
- **Plans/billing** are defined as entitlements only; no payment provider is integrated.
- **Desktop packaging** is documented but not produced in this environment.

### Feature panels

Every panel is reachable from the sidebar:

Overview · Projects · Execution center · Automation studio · AI assistant · Agent workforce · AI benchmarking · AI Provider Center · AI Model Registry · AI Playground · API workspace · Performance · Security · Defects · Reports & analytics · Integrations · Team & settings • Documentation.

The Execution center now exposes two creation modes (**Automated** and **Manual**) and links each manual run to its dedicated workspace at `/app/runs/:runId/execute`.

---

## 3. Upcoming features & roadmap

The roadmap follows the master phase plan. Status words are used strictly.

| Phase | Scope | Status |
| --- | --- | --- |
| 37 | Full test-case management (CSV import/export, step editor, dedicated history UI) | **Partial** |
| 39 | AI systems benchmarking: inventory, reproducible suites, dashboard, leaderboards, reports | **Complete** |
| 40 | AI provider management: provider CRUD, model registry, credentials, connection testing, playground, routing | **Complete** |
| 41 | AI orchestration: intelligent routing with fallback/retry, multi-model benchmark automation, playground session management & exports, AI orchestration dashboard | **Complete** |
| 42 | Automation Studio execution engine expansion | Planned |
| 43 | Browser testing via Playwright | Planned (adapter exists, unverified here) |
| 44 | Performance testing expansion | Planned |
| 45 | Defensive security testing expansion | Planned |
| 46 | Code quality / static analysis | Planned |
| 47 | Reports & exports expansion | Planned |
| 48 | Project-aware AI assistant | Planned |
| 49–56 | Notifications, auth hardening, integrations, RAG, crawler, providers, evaluation, recovery | Planned |
| 57–68 | Regression, optimisation, packaging, mobile, docs, onboarding, licensing, accessibility, QA, final audit | Planned / partially blocked by environment |

Known blockers are listed in [PROGRESS.md](PROGRESS.md) and [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md). Nothing above is implemented until it appears in the verified table.

---

## 4. Development progress

- **Phase 34** — Frontend architecture & design system: complete.
- **Phase 35** — Dashboard completion: complete.
- **Phase 36** — Project management: complete.
- **Phase 37** — Test case management: **partial** (existing CRUD/bulk/versioning verified; extended scope outstanding).
- **Phase 38** — Test execution engine (manual workspace + history): **complete and verified** in this build.
- **Phase 39** — AI systems benchmarking & evaluation: **complete and verified** in this build.
- **Phase 40** — AI provider management & multi-model integration: **complete and verified** in this build.
- **Phase 41** — AI orchestration, intelligent routing & benchmark automation: **complete and verified** in this build.

### Latest verification (Phase 41)

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass (client + server) |
| `npm test` | **76 / 76 passing** across 6 files (no regressions) |
| `npm run build` | Pass |
| Live preview | <http://127.0.0.1:4317/app/ai/routing-dashboard> verified in a real Chromium browser; intelligent routing with real fallback/retry, multi-model benchmark runner, playground session management with JSON/CSV exports, security hardening, and AI orchestration analytics all verified across 1440, 834, and 390 px viewports |

### Latest verification (Phase 39)

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass (client + server) |
| `npm test` | **76 / 76 passing** across 6 files (includes 15 new benchmark tests) |
| `npm run build` | Pass — `Benchmarks` chunk 24.38 kB gzip 6.90 kB |
| Live preview | <http://127.0.0.1:4317/app/benchmarks> verified in a real Chromium browser; a benchmark was executed live from the dashboard UI |
| Responsive check | No page-level horizontal overflow at 1440, 834 and 390 px |

**Measured AI results in this build:** local heuristics provider — pass rate 100%, triage F1 100%, consistency 100%, hallucination rate 0%, injection resistance 100%, avg latency ~0.1 ms. One genuine weakness (indented recommendation lines misparsed as quoted case titles, 4.8% hallucination rate) was found, fixed and re-verified with the same fixtures — labelled as *output-format hardening + parser disambiguation*, **not** model training. Cloud providers (Ollama / OpenAI-compatible) are unconfigured here and are honestly marked **untested**; no overall winner is declared with a single evaluated target.

Methodology, per-model report and comparison report: [`docs/AI_BENCHMARK_METHODOLOGY.md`](docs/AI_BENCHMARK_METHODOLOGY.md), [`docs/AI_MODEL_REPORT_LOCAL_PROVIDER.md`](docs/AI_MODEL_REPORT_LOCAL_PROVIDER.md), [`docs/AI_BENCHMARK_COMPARISON.md`](docs/AI_BENCHMARK_COMPARISON.md).

Screenshots: [inventory](docs/screenshots/phase39-benchmarks-inventory.png), [suites](docs/screenshots/phase39-benchmarks-suites.png), [history](docs/screenshots/phase39-benchmarks-history.png), [run detail](docs/screenshots/phase39-benchmarks-run-detail.png), [leaderboard](docs/screenshots/phase39-benchmarks-leaderboard.png), [compare](docs/screenshots/phase39-benchmarks-compare.png), [live UI run](docs/screenshots/phase39-benchmarks-live-run.png), [tablet](docs/screenshots/phase39-benchmarks-tablet-834.png), [mobile](docs/screenshots/phase39-benchmarks-mobile-390.png).

### Known limitations

- Manual evidence is stored as reference links, not binary attachments.
- Run history pagination is server-side; manual workflow polling is every 5 seconds (SSE is used for automated runs).
- The demo account is flagged `mustChangePassword`; the Phase 38 browser verification used a separate local account in a temporary data directory so real user data was untouched.
- CSV import/export for cases (Phase 37 scope) is still outstanding.

---

## 5. Plans & product strategy

Proposed entitlements (definitions exist in code; **no payment processing is integrated**, so prices are placeholders and marked proposed):

| Plan | Audience | Proposed scope | Pricing |
| --- | --- | --- | --- |
| Free | Individuals | 1 project, limited runs, local AI | Free — proposed |
| Pro | Solo QA | More projects/runs, reports, API workspace | TBD — proposed |
| Ultimate | Small teams | Manual + automated execution, AI agents, integrations | TBD — proposed |
| Business | Organisations | RBAC, audit, SSO roadmap, higher limits | TBD — proposed |
| Enterprise | Large orgs | Custom deployment, support, entitlements | Contact — proposed |

Monetisation roadmap: licence enforcement UI → provider integration (only with approved credentials) → seat management. Until then, plan switching is a local entitlement simulation only.

---

## 6. Technical documentation

### Stack

- **Client:** React 18, TypeScript, Vite 5, custom CSS design system, Lucide icons, React Router 6
- **API:** Node.js 20+, Express 4, Zod validation
- **Storage:** atomic JSON store (`data/testpilot.json`) or optional SQLite via `TESTPILOT_STORAGE=sqlite`
- **Testing:** Vitest (unit + API integration), Playwright (E2E, optional browser adapter)
- **AI:** deterministic local provider by default; Ollama / OpenAI-compatible optional

### Folder structure

```
server/            Express app, routes, storage adapters, engines, AI providers
  routes/          core, runs, ai, tools
  engine/          orchestrator + real runners
shared/types.ts    Domain types shared by client and server
src/               React client
  pages/           One file per panel (Runs.tsx, ExecutionWorkspace.tsx, …)
  components/      Reusable UI (ui.tsx, Shell.tsx)
  lib/             API client, hooks
tests/             Vitest suites + Playwright scripts
docs/              Architecture, API, security, reports, screenshots
data/              Local runtime data (created on first launch)
```

### Installation and setup

```bash
npm install
npm run dev
```

- Web: <http://127.0.0.1:4317>
- API health: <http://127.0.0.1:4318/api/health>

Demo account (auto-seeded on a fresh database): `demo@testpilot.ai` / `Demo1234!` — flagged for password rotation.

### Environment configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4318` | API / production server port |
| `TESTPILOT_DATA_DIR` | `./data` | JSON store and evidence directory |
| `TESTPILOT_SEED` | unset | `0` disables demo seeding |
| `TESTPILOT_STORAGE` | `json` | `sqlite` enables the SQLite adapter |
| `AI_PROVIDER` | `local` | `local`, `ollama`, `openai-compatible` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | local defaults | Ollama endpoint/model |
| `OPENAI_COMPATIBLE_*` | empty | Optional provider credentials (server-side only) |
| `TRUST_PROXY` | `0` | Set `1` behind a trusted TLS proxy |

### API and storage overview

Key Phase 38/39 endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/runs` | Create automated run or manual draft (`mode: "manual"`) |
| `POST` | `/api/runs/:id/start` | Draft → running |
| `POST` | `/api/runs/:id/pause` / `resume` | Pause / resume a manual run |
| `POST` | `/api/runs/:id/results/:caseId` | Record Pass/Fail/Blocked/Skip or reset |
| `POST` | `/api/runs/:id/complete` | Close a run when every case has a result |
| `POST` | `/api/runs/:id/cancel` | Cancel automated or manual run |
| `GET` | `/api/runs/history` | Filtered, paginated history (`projectId`, `status`, `mode`, `q`, `sort`, `page`) |
| `GET` | `/api/cases/:id/history` | Per-case execution history |
| `GET` | `/api/ai/benchmarks/suites` | The 7 benchmark suite definitions |
| `POST` | `/api/ai/benchmarks/run` | Execute selected suites against the active provider (tester+) |
| `GET` | `/api/ai/benchmarks/runs` | Append-only benchmark history (paginated) |
| `GET` | `/api/ai/benchmarks/runs/:id/export` | JSON / CSV export of a run |
| `GET` | `/api/ai/benchmarks/leaderboard` | Weighted leaderboard; winner only with ≥2 evaluated targets |
| `POST` | `/api/ai/benchmarks/compare` | Before/after delta comparison; 409 on configHash mismatch |

Storage is transactional at the file level (atomic JSON writes). Run results are appended to the run record and are never silently overwritten; deleting a case does not delete historical results.

### Supported platforms and hardware

- Windows 10/11, macOS, Linux (web build)
- Node.js 20 LTS or newer
- Designed for low-spec hardware: tested layout target Intel Core i5-4200U, 8 GB RAM, integrated graphics, no GPU required
- Browser: current Chromium/Edge/Firefox

---

## 7. Visual documentation

Live preview (verified in this build): **<http://127.0.0.1:4317/app>**

| Screen | Path |
| --- | --- |
| AI benchmarking — inventory (desktop) | `docs/screenshots/phase39-benchmarks-inventory.png` |
| AI benchmarking — run detail | `docs/screenshots/phase39-benchmarks-run-detail.png` |
| AI benchmarking — leaderboard | `docs/screenshots/phase39-benchmarks-leaderboard.png` |
| AI benchmarking — live UI run | `docs/screenshots/phase39-benchmarks-live-run.png` |
| AI Provider Center | `docs/screenshots/phase40-providers-desktop.png` |
| AI Model Registry | `docs/screenshots/phase40-models-desktop.png` |
| AI Playground | `docs/screenshots/phase40-playground-desktop.png` |
| Provider Health | `docs/screenshots/phase40-health-desktop.png` |
| Intelligent Routing | `docs/screenshots/phase40-routing-desktop.png` |
| Provider Activity | `docs/screenshots/phase40-activity-desktop.png` |
| Manual execution workspace (desktop) | `docs/screenshots/phase38-workspace-desktop.png` |
| Manual execution workspace (tablet) | `docs/screenshots/phase38-workspace-tablet.png` |
| Manual execution workspace (mobile) | `docs/screenshots/phase38-workspace-mobile.png` |
| Execution center with filters and pagination | `docs/screenshots/phase38-runs-desktop.png` |
| Manual run creation panel | `docs/screenshots/phase38-newrun-manual.png` |

To reproduce: sign in, open **Execution center**, click **New run → Manual**, choose a suite and cases, then open the run's workspace.

---

## 8. Documentation accuracy

- `PROGRESS.md` tracks per-phase status and the latest verified commands.
- `docs/FEATURE_MATRIX.md` classifies each capability.
- `docs/PHASE_<n>_*_REPORT.md` files record what was actually built and tested.
- Screenshots in `docs/screenshots/` were captured from the running application with Playwright; they are not mockups.
- Planned work is labelled Planned; blocked work is labelled Blocked; partial work is labelled Partial.

---

## License

Proprietary. All rights reserved.
