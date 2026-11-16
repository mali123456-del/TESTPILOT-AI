# Security Model

TESTPILOT AI is designed for self-hosted, low-spec environments. Security is defense-in-depth: no single control is relied upon.

## Authentication

- Passwords are hashed with **scrypt** (salted, memory-hard).
- Session cookie `tp_session` is **HttpOnly**, **SameSite=Lax**, `Secure` when `TRUST_PROXY=1` or `NODE_ENV=production`.
- CSRF protection uses a **double-submit** pattern: the CSRF token is returned on login/me and must be sent as the `x-csrf-token` header on all non-GET requests.
- The first registered account becomes the workspace **owner**.
- Session fixation protection: existing sessions for a user are destroyed on login before issuing a new session.

## Authorization (RBAC)

Roles: `owner` > `admin` > `qa_lead` > `tester` > `viewer`.
- `owner`: full access, billing/plan, demo seeding.
- `admin`: members, tokens, project deletion.
- `qa_lead`: schedules, workflows, case deletion, approvals.
- `tester`: create runs, cases, suites, API sends, agent runs.
- `viewer`: read-only.

Every server route enforces role requirements. Client UI hides actions the user can't perform, but server-side enforcement is authoritative.

## Network safety

- Any outbound HTTP target (API runner, load test, security scan, integration) is checked by `assertSafeUrl()`:
  - Only `http:`/`https:` schemes allowed.
  - Cloud-metadata hosts blocked (`169.254.169.254`, `metadata.google.internal`, `metadata.azure.internal`).
  - Private / reserved IPv4 addresses blocked except `localhost`/`127.0.0.1` (SSRF mitigation).
  - Project allowlist enforced when configured; localhost allowed for local QA.
- Rate limits are enforced in-memory per `ip:user` key.
- Registration endpoint is rate-limited (6 attempts per 15 minutes per IP).
- Login endpoint is rate-limited (12 attempts per 15 minutes per IP) with progressive lockout (5 failures → 15-minute lockout per email).

## Session security

- Session cookie `tp_session` is **HttpOnly**, **SameSite=Lax**, `Secure` when `TRUST_PROXY=1` or `NODE_ENV=production`.
- Session IDs are rotated on login.
- Sessions expire after 7 days and are pruned hourly.

## Headers

Express sets on every response:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
- `Strict-Transport-Security` only when `TRUST_PROXY=1`.

## Dependency audit (Phase 32)

`npm audit --omit=dev` reported 9 vulnerabilities (1 low, 1 moderate, 7 high) in Express transitive dependencies
(body-parser, cookie, path-to-regexp, qs) and zod. `npm audit fix --force` was NOT applied because it would install
breaking changes outside stated dependency ranges (express@4.22.3, zod@4.6.7). Code-level mitigations are in place:
- body-parser DoS: request body limited to 1 MB via `express.json({ limit: '1mb' })`.
- cookie: cookie names/values are server-generated, not user-controlled.
- path-to-regexp ReDoS: all routes are static strings, no user-controlled regex patterns.
- qs DoS: request validation uses zod, not qs directly.
- zod memory exhaustion: all schemas enforce max lengths on strings and arrays.
- react-router XSS/open redirect: mitigated by CSP (`frame-ancestors 'none'`, `connect-src 'self'`) and no client-side open redirects.

## Secrets

- AI provider API keys are read from env (`OPENAI_COMPATIBLE_API_KEY`) and never echoed in responses.
- Workspace API tokens are shown once at creation.
- No payment provider is integrated; billing plan switching is simulated.

## Limitations (honest)

- JSON-file store with file-level atomicity; no database encryption at rest beyond filesystem permissions.
- In-memory rate limits reset on server restart.
- Playwright browser E2E not installed; reported `skipped` rather than faked.
- Desktop/mobile installers not produced (no Rust/mobile toolchain).
- Session cookie `Secure` flag not set in development (TRUST_PROXY != 1 and NODE_ENV != production).

## Reporting concerns

Security issues should be reported privately, not via public issues. Do not scan targets you do not own or have written permission to test.
