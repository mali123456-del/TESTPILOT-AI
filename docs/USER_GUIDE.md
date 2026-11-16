# User Guide

TESTPILOT AI — Build Better. Test Smarter. Ship Confidently.

## First launch

1. `npm install && npm run dev`
2. Open <http://127.0.0.1:4317>
3. The demo workspace seeds automatically. Sign in with:
   - Email: `demo@testpilot.ai`
   - Password: `Demo1234!`
   - Role: owner

Seeded history is labelled **sample data**. Runs you trigger yourself are real.

## Dashboard (Overview)

The quality command center shows real metrics from your stored data: pass rate, open defects, flaky cases, case coverage, release readiness, recent runs, and coverage by test type. The readiness breakdown is computed from actual run results.

## Projects

Create and manage projects under Workspace > Projects. Each project owns its suites, cases, runs, and schedules.

## Test Cases & Suites

- Create cases with title, module, priority, steps, preconditions, expected results, and tags.
- Group cases into suites for repeatable execution.
- Enable/disable cases without deleting them.

## Running tests

- From the dashboard: click **Run suite** or go to Execution center > New run.
- Select a project, optional suite, and cases. Trigger runs run through the real engines:
  - Unit (sandboxed `vm`)
  - API (HTTP with assertions)
  - Accessibility, visual regression, database integrity, load, security
- Watch progress via the SSE stream on the run page.
- Browser E2E requires Playwright (not installed); runs report `skipped` with reason.

## Automation Studio

Create schedules (recurring suite execution) and multi-step workflows with retry, parallel steps, and per-step timeouts. Workflows can be triggered manually.

## AI Test Engineer

Chat with the assistant for test ideas, QA planning, bug triage, and edge-case suggestions. The default provider is local and works offline. Optional Ollama / OpenAI-compatible providers can be configured via `.env`. AI write actions require approval from a qa_lead.

## Bug Intelligence

Create defects with severity, status, and steps to reproduce. Link defects to failing run results. Track resolution through Open → In Progress → Resolved → Closed.

## Reports & Analytics

View pass-rate trends, execution duration, defect breakdown by severity, and coverage by test type. Export reports as CSV or JSON. Exports are generated from real stored data.

## Integrations

Configure webhooks and a workspace API token for CI. The CI hook (`POST /api/hooks/run`) authenticates with a bearer token and triggers runs. Third-party connections (GitHub, GitLab, Jira, Slack) are configuration entries — they are not pre-connected or faked.

## Settings

- Workspace name, language, timezone.
- Dark/light theme.
- AI provider configuration (local default; Ollama/OpenAI-compatible optional).
- Plan entitlements (Free/Pro/Ultimate/Business). Plan switching is simulated; no payment provider is connected.

## Demo account

`demo@testpilot.ai` / `Demo1234!` — owner role, seeded workspace. Change the password after first use in production.

## Low-spec target

Tested for Intel i5-4200U, 8 GB RAM, integrated graphics, Windows 10. No mandatory local AI model; optional cloud AI only.
