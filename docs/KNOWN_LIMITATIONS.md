# Known Limitations

TESTPILOT AI is a working self-hosted QA platform. These limitations are honest and not claimed as features.

## Desktop / mobile packaging

- **Phase 23 (Windows .exe):** Not built. No Rust toolchain confirmed; Tauri config documented only. Installers not published.
- **Phase 24 (mobile/tablet):** Responsive CSS breakpoints exist, but no Android/iOS toolchain confirmed; no store builds.

## Browser E2E

- Playwright is not installed. Browser-based test runs report `skipped` with the reason rather than pretending to pass. Install Playwright to enable real browser E2E.

## Data storage

- Atomic JSON file store (`data/testpilot.json`). No database encryption at rest beyond filesystem permissions. In-memory rate limits reset on server restart.

## AI

- Default provider is deterministic/local (no paid API required). Ollama and OpenAI-compatible providers are optional and require separate installation/configuration. AI writes are gated by approval (default on).

## Billing

- Plan switching is simulated. No payment provider is contacted or integrated.

## Marketing screenshots

- Not captured in this headless environment (no visible browser window). A user can capture them manually from `http://127.0.0.1:4317` after login into `public/screenshots/`.

## Seeded data

- The demo workspace is seeded with sample projects, suites, cases, runs, and defects. This data is labelled as illustrative/sample; it is not real production data.
- **Demo credentials:** All seeded demo users (`demo@testpilot.ai`, `lead@testpilot.ai`, `tester@testpilot.ai`, `viewer@testpilot.ai`) share the same default password (`Demo1234!`) and are flagged `mustChangePassword: true`. On first login, users are redirected to a mandatory password-change page. These credentials **must** be rotated before any production deployment.

## Auth hardening (Phase 31 — complete)

- `mustChangePassword` field on `User` type
- `POST /auth/change-password` endpoint (authenticated, requires current password)
- Progressive login lockout: 5 consecutive failures → 15-minute lockout per email
- Login and `/auth/me` return `mustChangePassword` flag; frontend auto-redirects to change-password page
- Password change clears `mustChangePassword` and audits the event

## Low-spec target

- Optimized for Intel i5-4200U, 8 GB RAM, integrated graphics, Windows 10. Load tests are bounded (max 200 requests / 20 workers) to protect low-spec hosts.

## Git

- Local git is not initialized; no commits exist. GitHub push requires explicit user approval.
