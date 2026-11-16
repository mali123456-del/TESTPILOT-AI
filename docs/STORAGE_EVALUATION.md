# Phase 30 — Production Storage Evaluation & Implementation

**TESTPILOT AI — Production Storage Evaluation**  
**Status:** Complete — dual-storage architecture implemented, tested, and verified  
**Date:** Fri Nov 06 2026

---

## 1. Implementation Summary

The dual-storage architecture has been implemented and verified:

| Component | Status |
| --- | --- |
| `StorageAdapter` interface | Complete (`server/store.ts`) |
| `JsonStorageAdapter` (default) | Complete — existing behavior preserved exactly |
| `SqliteStorageAdapter` (opt-in) | Complete — uses `sql.js` (pure WASM, no native build) |
| Environment-based selection | Complete — `TESTPILOT_STORAGE=json` (default) or `sqlite` |
| JSON-to-SQLite migration script | Complete — `scripts/migrate-json-to-sqlite.mjs` |
| Storage adapter tests | Complete — 4 new tests in `tests/storage.test.ts` |
| Typecheck | Clean (client + server) |
| Tests | 38/38 pass (34 original + 4 storage) |
| Production build | Passes |

---

## 2. Architecture

### StorageAdapter interface (`server/store.ts`)

```typescript
export interface StorageAdapter {
  readonly name: string;
  load(): Promise<Database>;
  saveDb(): void;
  flushDb(): void;
  audit(workspaceId, actor, action, target?, meta?, ip?): void;
  pruneSessions(): void;
  close?(): void;
}
```

### Adapters

| Adapter | Class | File | Default? |
| --- | --- | --- | --- |
| JSON file | `JsonStorageAdapter` | `server/store.ts` | Yes (`TESTPILOT_STORAGE=json`) |
| SQLite (WASM) | `SqliteStorageAdapter` | `server/store-sqlite.ts` | Opt-in (`TESTPILOT_STORAGE=sqlite`) |

### Data model

All 18 collections map 1:1 to SQLite tables:
`workspaces, users, sessions, projects, suites, cases, runs, bugs, workflows, schedules, collections, perfRuns, securityScans, integrations, approvals, agentRuns, audit, reports`

Each table stores records as JSON in a `payload` column, preserving every field exactly including nested objects/arrays.

### Concurrency & safety

- Single Node.js process; SQLite via sql.js WASM (one writer at a time)
- `flushDb()` syncs in-memory state to SQLite in a transaction, then persists to file atomically (temp file + rename)
- Graceful shutdown via `SIGINT` → `saveDb()` → `closeStorage()`
- Audit log capped at 5,000 entries
- Session pruning hourly

---

## 3. Migration Script (`scripts/migrate-json-to-sqlite.mjs`)

### Safety guarantees

1. **Mandatory backup:** Creates a timestamped `.bak` copy of `testpilot.json` before migration, verifies byte-for-byte integrity
2. **Original never modified:** `data/testpilot.json` is read-only during migration
3. **No overwrite:** Fails if `testpilot.sqlite` already exists
4. **Integrity verification:** Reads back the SQLite file and compares record counts per collection
5. **Manifest:** Generates `migration-manifest-<timestamp>.json` with source/target counts

### Migration results (tested)

| Collection | Source | Verified | Match |
| --- | --- | --- | --- |
| workspaces | 1 | 1 | ✅ |
| users | 4 | 4 | ✅ |
| sessions | 4 | 4 | ✅ |
| projects | 3 | 3 | ✅ |
| suites | 12 | 12 | ✅ |
| cases | 24 | 24 | ✅ |
| runs | 18 | 18 | ✅ |
| bugs | 5 | 5 | ✅ |
| workflows | 2 | 2 | ✅ |
| schedules | 2 | 2 | ✅ |
| collections | 1 | 1 | ✅ |
| perfRuns | 0 | 0 | ✅ |
| securityScans | 0 | 0 | ✅ |
| integrations | 10 | 10 | ✅ |
| approvals | 1 | 1 | ✅ |
| agentRuns | 0 | 0 | ✅ |
| audit | 7 | 7 | ✅ |
| reports | 0 | 0 | ✅ |
| **Total** | **94** | **94** | **0 mismatches** |

### Rollback procedure

1. Stop the server
2. Remove or rename `data/testpilot.sqlite`
3. Restore `data/testpilot.json` from the `.bak` backup
4. Unset `TESTPILOT_STORAGE` (defaults to `json`)
5. Restart server

---

## 4. Usage

### Default (JSON) — no change needed

```bash
npm run dev
# or
npm start
```

### SQLite mode (opt-in)

```bash
TESTPILOT_STORAGE=sqlite npm run dev
# or
TESTPILOT_STORAGE=sqlite npm start
```

### Health endpoint reflects storage adapter

```
GET /api/health
→ {"status":"ok","storage":"json-file","ai":"local",...}
→ {"status":"ok","storage":"sqlite","ai":"local",...}
```

---

## 5. Files Changed

| File | Change |
| --- | --- |
| `server/store.ts` | Added `StorageAdapter` interface, `JsonStorageAdapter` class, `emptyDatabase()` export, adapter selection via `TESTPILOT_STORAGE`, async `loadDb()` |
| `server/store-sqlite.ts` | New — `SqliteStorageAdapter` using `sql.js` WASM |
| `server/store-sqlite.d.ts` | Removed (merged into `.ts`) |
| `server/index.ts` | Async `loadDb()`, `storageAdapterName()` in health endpoint, `closeStorage()` on SIGINT, scheduler data dir check |
| `package.json` | Added `sql.js@1.15.2` dependency |
| `types/sql-js.d.ts` | New — type declarations for sql.js |
| `tsconfig.server.json` | Added `files` entry for sql-js.d.ts |
| `tsconfig.json` | Added `allowImportingTsExtensions` |
| `scripts/migrate-json-to-sqlite.mjs` | New — one-time JSON-to-SQLite migration script |
| `tests/storage.test.ts` | New — 4 storage adapter tests (JSON + SQLite persistence, audit cap, session pruning) |
| `docs/STORAGE_EVALUATION.md` | Updated — implementation complete |
| `PROGRESS.md` | Updated — Phase 30 marked complete |
| `docs/FEATURE_MATRIX.md` | Updated — Phase 30 marked complete |

---

## 6. Blockers Remaining

| Blocker | Impact |
| --- | --- |
| Phase 23 Windows .exe | No Rust/Cargo toolchain confirmed; Tauri config present but not built |
| Phase 24/52/53 Mobile | No Android Studio / Xcode confirmed |
| Phase 33 Playwright | Not installed; browser E2E reported `skipped` with reason |
| Marketing screenshots | Headless environment; capture manually from live preview |
| GitHub push | Requires explicit user approval |

---

## 7. Verification Commands (all pass)

```powershell
npm run typecheck   # Clean (client + server)
npm test            # 38/38 pass (34 original + 4 storage)
npm run build       # Production build passes
```

**No production data has been migrated.** The default storage remains `TESTPILOT_STORAGE=json`. SQLite is opt-in only. The original `data/testpilot.json` is untouched.
