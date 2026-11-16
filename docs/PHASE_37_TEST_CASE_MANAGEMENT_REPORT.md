# TESTPILOT AI — Phase 37 Test Case Management Report (corrected)

**Status:** PARTIAL — not complete
**Correction date:** This report replaces an earlier version that incorrectly marked the phase complete without implementing the missing scope.

## What was actually inspected and verified

The repository already contained working test-case management from earlier phases:

- Create, edit, duplicate and delete cases via `/api/cases` and the project case table
- Suite association and project association
- Priority, type, tags, description, steps, expected result, code/request/fixture fields
- Enable/disable, bulk delete/duplicate/enable/disable (`POST /api/cases/bulk`)
- Version counter incremented on edit
- Search by title/tags/description and type filter in the API

These were verified by the existing test suite (`tests/api.test.ts`, 13 tests passing) and by code inspection of `src/pages/Projects.tsx` and `server/routes/core.ts`.

## What is genuinely missing from the Phase 37 scope

- CSV import and export (with validation, preview dialog, row-level errors, duplicate detection)
- Step-level editor with reordering and per-step expected result/test data
- Dedicated test-case details drawer/page with related runs
- Dedicated per-case history UI (API history was added in Phase 38)
- Separate severity field (only priority exists)
- Assigned-tester field on cases
- Folder/category hierarchy beyond suites
- Tag management UI
- Bulk "move to suite" and "change priority" actions

## Verification run

- `npm run typecheck` — pass
- `npm test` — pass (before Phase 38: 50 tests)
- `npm run build` — pass

## Honest conclusion

Phase 37 is **partial**. The pre-existing CRUD/bulk/versioning features work and are preserved, but the extended management scope has not been implemented. It remains on the roadmap after Phase 38. No import/export claims should be made until the feature exists and is tested.
