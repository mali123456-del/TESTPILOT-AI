#!/usr/bin/env node
/**
 * TESTPILOT AI — One-time JSON-to-SQLite migration script.
 *
 * Reads data/testpilot.json and writes data/testpilot.sqlite, preserving
 * every record exactly. The original JSON file is NEVER modified or deleted.
 *
 * Usage:
 *   TESTPILOT_DATA_DIR=./data node scripts/migrate-json-to-sqlite.mjs
 *
 * Safety:
 *   - Creates a timestamped .bak backup of testpilot.json before migration
 *   - Never deletes or modifies the original JSON file
 *   - Generates a migration manifest with record counts and integrity checks
 *   - Verifies row counts match source before completing
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.TESTPILOT_DATA_DIR ?? './data');
const JSON_FILE = path.join(DATA_DIR, 'testpilot.json');
const SQLITE_FILE = path.join(DATA_DIR, 'testpilot.sqlite');

const COLLECTIONS = [
  'workspaces', 'users', 'sessions', 'projects', 'suites', 'cases', 'runs',
  'bugs', 'workflows', 'schedules', 'collections', 'perfRuns', 'securityScans',
  'integrations', 'approvals', 'agentRuns', 'audit', 'reports',
];

function nowIso() {
  return new Date().toISOString();
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function backupJson() {
  ensureDir();
  if (!fs.existsSync(JSON_FILE)) {
    throw new Error(`Source JSON file not found: ${JSON_FILE}`);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bakFile = path.join(DATA_DIR, `testpilot.json.bak.${ts}`);
  fs.copyFileSync(JSON_FILE, bakFile);
  const bakStat = fs.statSync(bakFile);
  const srcStat = fs.statSync(JSON_FILE);
  if (bakStat.size !== srcStat.size) {
    throw new Error(`Backup verification failed: ${bakStat.size} != ${srcStat.size}`);
  }
  console.log(`[migrate] Backup created: ${bakFile} (${bakStat.size} bytes, verified)`);
  return bakFile;
}

function readJson() {
  if (!fs.existsSync(JSON_FILE)) {
    throw new Error(`Source JSON file not found: ${JSON_FILE}`);
  }
  const raw = fs.readFileSync(JSON_FILE, 'utf8');
  const db = JSON.parse(raw);
  for (const c of COLLECTIONS) {
    if (!(c in db)) db[c] = [];
  }
  return db;
}

async function migrate() {
  ensureDir();

  console.log(`[migrate] Source: ${JSON_FILE}`);
  console.log(`[migrate] Target: ${SQLITE_FILE}`);

  // Step 1: Mandatory backup
  const bakFile = backupJson();

  // Step 2: Read source JSON
  const source = readJson();
  const sourceCounts = {};
  let sourceTotal = 0;
  for (const c of COLLECTIONS) {
    const arr = source[c];
    sourceCounts[c] = Array.isArray(arr) ? arr.length : 0;
    sourceTotal += sourceCounts[c];
  }
  console.log(`[migrate] Source records: ${sourceTotal}`);
  console.log(JSON.stringify(sourceCounts, null, 2));

  // Step 3: Check if SQLite file already exists
  if (fs.existsSync(SQLITE_FILE)) {
    throw new Error(
      `SQLite file already exists: ${SQLITE_FILE}. Remove it or choose a different TESTPILOT_DATA_DIR to avoid overwriting.`,
    );
  }

  // Step 4: Import sql.js and create SQLite database
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Step 5: Create schema
  const PAYLOAD_COL = 'payload';
  const COMMON_COLS = 'id TEXT PRIMARY KEY, createdAt TEXT, updatedAt TEXT';
  const createSql = COLLECTIONS.map((c) =>
    `CREATE TABLE IF NOT EXISTS ${c} (
      ${COMMON_COLS},
      ${PAYLOAD_COL} TEXT NOT NULL DEFAULT '{}'
    );`,
  ).join('\n');
  db.exec(createSql);

  // Step 6: Insert all records
  const insertCounts = {};
  const nowTs = nowIso();

  for (const c of COLLECTIONS) {
    const rows = source[c] || [];
    const stmt = db.prepare(
      `INSERT INTO ${c} (id, createdAt, updatedAt, ${PAYLOAD_COL}) VALUES (?, ?, ?, ?);`,
    );
    let inserted = 0;
    for (const row of rows) {
      const obj = row;
      const id = String(obj.id ?? '');
      const createdAt = String(obj.createdAt ?? nowTs);
      const updatedAt = String(obj.updatedAt ?? nowTs);
      const payload = JSON.stringify(obj);
      stmt.run([id, createdAt, updatedAt, payload]);
      inserted++;
    }
    stmt.free();
    insertCounts[c] = inserted;
  }

  // Step 7: Persist to file
  const data = db.export();
  const tmp = `${SQLITE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(data));
  fs.renameSync(tmp, SQLITE_FILE);
  db.close();

  // Step 8: Verify by reading back
  const verifyDb = new SQL.Database(fs.readFileSync(SQLITE_FILE));
  const verifyCounts = {};
  let verifyTotal = 0;
  for (const c of COLLECTIONS) {
    const vResult = verifyDb.exec(`SELECT COUNT(*) FROM ${c}`);
    const count = vResult[0]?.values?.[0]?.[0] ?? 0;
    verifyCounts[c] = Number(count);
    verifyTotal += Number(count);
  }
  verifyDb.close();

  // Step 9: Compare counts
  let mismatches = 0;
  for (const c of COLLECTIONS) {
    const src = sourceCounts[c] ?? 0;
    const ver = verifyCounts[c] ?? 0;
    if (src !== ver) {
      console.error(`[migrate] MISMATCH ${c}: source=${src} verified=${ver}`);
      mismatches++;
    }
  }

  // Step 10: Write manifest
  const manifest = {
    migratedAt: nowIso(),
    sourceFile: JSON_FILE,
    backupFile: bakFile,
    targetFile: SQLITE_FILE,
    sourceTotal,
    verifiedTotal: verifyTotal,
    mismatches,
    sourceCounts,
    verifiedCounts: verifyCounts,
    success: mismatches === 0 && sourceTotal === verifyTotal,
  };
  fs.writeFileSync(path.join(DATA_DIR, `migration-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(manifest, null, 2));

  // Step 11: Report
  console.log(`[migrate] Verified records: ${verifyTotal}`);
  console.log(JSON.stringify(verifyCounts, null, 2));
  console.log(`[migrate] Mismatches: ${mismatches}`);
  console.log(
    `[migrate] ${manifest.success ? 'SUCCESS' : 'FAILED'}: ${
      manifest.success ? 'All records migrated and verified' : 'Migration had mismatches — do not switch to SQLite mode'
    }`,
  );

  if (!manifest.success) {
    process.exit(1);
  }
}

migrate().catch((err) => {
  console.error('[migrate] FATAL:', err.message);
  process.exit(1);
});
