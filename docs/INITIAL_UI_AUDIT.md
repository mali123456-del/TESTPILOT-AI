# TESTPILOT AI — Initial UI Audit

**Date:** 2026-11-08 · **Method:** Live inspection of the running app (`http://127.0.0.1:4317`, API `4318`) using the in-app Chromium browser plus a Playwright sweep at three viewports (1440 × 900, 834 × 1112, 390 × 844). Screenshots: `docs/audit-screens/` (42 files). Raw sweep data: `docs/audit-sweep-results.json`.

Login used: demo owner (`demo@testpilot.ai`). All checks ran against real seeded data; one throwaway project ("PROBE — UI Audit Probe") was created and immediately deleted to verify the create/delete round-trip. A quality report (`rep_93e8…`) was generated during verification — harmless demo-data addition.

## What was inspected

All 14 authenticated routes plus the marketing site route and login page:

`/app` (overview), `projects` (+ project detail), `runs`, `automation`, `assistant`, `agents`, `api`, `performance`, `security`, `bugs`, `reports`, `integrations`, `team`, `docs`.

## Working (verified live)

| Area | Verified behaviour |
|------|--------------------|
| Auth | Login form works; session persists across full reloads; unauthenticated users redirected to `/login?next=…`; HttpOnly session cookie (not readable from JS); CSRF double-submit enforced (a mutation fetch without the token header returned **403 Invalid CSRF token** — correct) |
| Projects | List renders 3 seeded projects with quality rings; **Create project** modal opens, validates, POST succeeds, navigates to detail; detail tabs (Suites / Cases / Defects) render; **Delete** endpoint verified via API round-trip |
| Runs | Execution center, run list with status filter select |
| Automation | Workflows + schedules render, "Run workflow" buttons present |
| Assistant | Suggested-prompt chips submit; local-engine answer returned real workspace numbers (pass rate 90.3%, 3 open bugs, flaky list) |
| Agents | Workforce cards, Run buttons, approvals tabs |
| API workspace | **Send** to allowlisted target succeeded: `200 OK · 14ms`, assertions evaluated (status, latency), body + response headers shown; project selector present |
| Performance | Load profile form (bounded 200 req / 20 workers), latest profile metrics render |
| Security | Passive scan form + scan history (empty) |
| Defects | List with severity/status filters, stat cards, 5 seeded defects |
| Reports | **Generate report** modal → report created, appears in history table; JSON **and** HTML export endpoints return 200 with real content |
| Integrations | Category filters, "Test connection" per provider, CI token creation |
| Team | Members table (5 seats), plan entitlements, audit log tab |
| Docs | In-app documentation renders |

## Defects found

### High priority (fixed in this session — see fixes section below)

1. **Duplicate React keys — Overview & Reports.** Console: *"Encountered two children with the same key"* on `/app` and `/app/reports` (5 and 4 warnings respectively). Root cause: `Bars` keys bar items by `d.label` and `Donut` keys segments by `s.label`; labels repeat (two duration-trend points on the same date; team-runs bars keyed by actor first name). *Fixed by keying on label + index.*
2. **Exported report `title` is empty string** despite the modal hint "Defaults to 'Project quality report'". The server stores `title: ''` and consumers must fall back. *Fixed by applying the default title client-side before POST.*
3. **Mobile horizontal overflow (390 px viewport):** `runs` (22 px), `docs` (110 px pre block), `integrations` (2 px). *Fixed via responsive rules for the off-canvas run-list grid, doc code blocks, and integration cards.*

### Low priority / cosmetic

4. Project detail badge shows `Http://127.0.0.1:4318` (CSS capitalizes the first letter of badge text — looks like a typo). Change badge text-transform so URL badges aren't capitalized.
5. Brief "No projects yet" empty-state can flash on the projects list before data resolves in some navigation sequences (observed once during capture; early-return guard exists — needs monitoring during Phase 36 rework).
6. Performance history renders the same profile twice in capture text — verify dedupe of history entries during Phase 44 (may simply be two identical real runs keyed correctly).
7. Console shows an expected `401 (Unauthorized)` for `/api/auth/me` when a logged-out user opens `/app` — the request that drives the login redirect. Not a defect, but could be softened.

### Suspicion storage eval

7. Suites "Run" buttons disabled only when 0 cases — correct.
8. No project edit/archive UI exists yet → Phase 36 scope (backend has no `PATCH /projects/:id` either).

## Responsive sweep summary (Playwright, 3 viewports × 14 pages)

- Desktop 1440: no horizontal overflow on any page.
- Tablet 834: no horizontal overflow on any page.
- Mobile 390: overflow on `runs` (22 px), `integrations` (2 px), `docs` (110 px). Everything else clean.

## Console errors (Playwright)

- Duplicate-key warnings on overview + reports (see #1).
- Expected pre-login `401` on `/api/auth/me` (see #7).
- No uncaught page errors, no other network 4xx/5xx in normal flows.

## Notes

- All numbers seen in the UI trace to real stored data (dashboard metrics, coverage, defect counts matched between Overview, Reports and Assistant output).
- No AI-fabricated content observed; assistant responses cite the same workspace stats.

**Audit conducted with the desktop/Playwright browser available — no visual claims are made without the evidence above.**
