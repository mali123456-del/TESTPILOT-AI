# Release Checklist

Do not commit, push, or release without explicit user approval.

## Pre-release verification

- [ ] `npm run typecheck` — clean (client + server)
- [ ] `npm test` — all tests pass (50/50 including storage + security tests)
- [ ] `npm run build` — production build passes
- [ ] Dev server reachable: `http://127.0.0.1:4317` and `http://127.0.0.1:4318/api/health`
- [ ] Demo login works: `demo@testpilot.ai` / `Demo1234!`
- [ ] Seeded history labelled as sample data
- [ ] No paid AI API required for basic functionality

## Documentation

- [ ] README.md present and accurate
- [ ] docs/ARCHITECTURE.md, API.md, SECURITY.md, USER_GUIDE.md, BUILD_AND_DEPLOY.md
- [ ] docs/FEATURE_MATRIX.md, KNOWN_LIMITATIONS.md, RELEASE_CHECKLIST.md
- [ ] PROGRESS.md checkpoint maintained

## Blockers (documented, not claimed)

- [ ] Windows .exe: no Rust toolchain — do not claim
- [ ] Mobile store builds: no mobile toolchain — do not claim
- [ ] Marketing screenshots: capture manually from live preview
- [ ] GitHub push: requires explicit approval

## Do not

- Do not `git reset --hard` or force push.
- Do not contact a payment provider.
- Do not fabricate test results, screenshots, or completion claims.
- Do not merge with NEXORA/OMNIVEX/AUREX/CALCORA/SENTRIX/DATAVISTA AI.
