# Architecture

TESTPILOT AI is a self-hosted AI software testing and QA workspace. It is split into three layers:

- **Web client** (React 18 + TypeScript + Vite) — premium UI shell, router, feature pages, design system.
- **API server** (Node.js + Express) — auth, workspace, projects, suites, cases, runs, AI, tools, CI hooks.
- **Storage** (atomic JSON file) — `data/testpilot.json` plus screenshots under `data/evidence/`.

## Ports

| Service | Port | Bind |
| --- | --- | --- |
| Web client (Vite dev) | `4317` | `127.0.0.1`, proxies `/api` to API |
| API server (Express) | `4318` | `127.0.0.1` |

## Data flow

1. Client calls `/api/*` through the Vite proxy (dev) or directly to port 4318 (production).
2. Express middleware applies security headers, rate limiting, session auth (`tp_session` HttpOnly cookie), and CSRF double-submit (`x-csrf-token`).
3. Routes validate input with Zod, enforce RBAC, read/write the atomic JSON store, and return JSON.
4. Run execution is handled by the orchestrator (concurrency cap 3, cancellation, SSE stream) and the engine runners.
5. AI features use the deterministic local provider by default; Ollama/OpenAI-compatible providers are optional via env.

## Directories

| Path | Purpose |
| --- | --- |
| `src/` | React client (pages, components, lib, styles) |
| `server/` | Express API, engines, AI layer, routes, seed |
| `shared/` | Canonical TypeScript domain types |
| `tests/` | Vitest suite (engine + API tests) |
| `data/` | JSON store + evidence (gitignored) |
| `public/` | Static assets, favicon |
| `dist/` | Production client build (gitignored) |
| `dist-server/` | Compiled server output (gitignored) |

## Auth & security

- Passwords hashed with scrypt.
- Session cookie `tp_session`, HttpOnly, SameSite=Lax.
- CSRF double-submit header `x-csrf-token`.
- RBAC roles: owner, admin, qa_lead, tester, viewer.
- In-memory rate limits per IP/user.
- URL allowlist + blocked cloud-metadata hosts for any outbound requests.
- CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, referrer policy.

## Test engines (real, not simulated)

- Sandboxed `node:vm` unit runner (no `require`/`process`/network/async, 8s cap).
- Server-side HTTP API runner with assertions.
- Static accessibility analysis.
- DOM-fingerprint visual regression.
- Fixture-based database integrity.
- Bounded load testing (max 200 requests / 20 workers).
- Passive security header scan.
- Browser E2E via optional Playwright adapter — not installed; reported `skipped` with reason.

## AI

- Deterministic local provider (works fully offline, no paid API required).
- Optional Ollama / OpenAI-compatible via `AI_PROVIDER` env.
- Approval gate for AI writes (default on for seeded workspace).

## Demo data

Seeded on first launch unless `TESTPILOT_SEED=0`. Demo account `demo@testpilot.ai` / `Demo1234!` (owner). Seeded history is labelled sample data; user runs are real.

## Desktop / mobile

Tauri packaging documented but not built — no Rust/mobile toolchain in this environment. Installers not published.
