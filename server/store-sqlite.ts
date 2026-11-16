import type { Database as SqlJsDatabase } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Database } from './store.js';
import { emptyDatabase } from './store.js';
import type { Session } from '../shared/types.js';

/** Canonical table -> collection mapping. Every JSON collection maps 1:1 to a table. */
const COLLECTIONS: Array<{ table: string; collection: keyof Database }> = [
  { table: 'workspaces', collection: 'workspaces' },
  { table: 'users', collection: 'users' },
  { table: 'sessions', collection: 'sessions' },
  { table: 'projects', collection: 'projects' },
  { table: 'suites', collection: 'suites' },
  { table: 'cases', collection: 'cases' },
  { table: 'runs', collection: 'runs' },
  { table: 'bugs', collection: 'bugs' },
  { table: 'workflows', collection: 'workflows' },
  { table: 'schedules', collection: 'schedules' },
  { table: 'collections', collection: 'collections' },
  { table: 'perfRuns', collection: 'perfRuns' },
  { table: 'securityScans', collection: 'securityScans' },
  { table: 'integrations', collection: 'integrations' },
  { table: 'approvals', collection: 'approvals' },
  { table: 'agentRuns', collection: 'agentRuns' },
  { table: 'audit', collection: 'audit' },
  { table: 'reports', collection: 'reports' },
  { table: 'benchmarks', collection: 'benchmarks' },
  { table: 'aiProviders', collection: 'aiProviders' },
  { table: 'aiModels', collection: 'aiModels' },
  { table: 'providerHealthChecks', collection: 'providerHealthChecks' },
  { table: 'providerConnectionTests', collection: 'providerConnectionTests' },
  { table: 'providerActivities', collection: 'providerActivities' },
  { table: 'aiRoutingConfig', collection: 'aiRoutingConfig' },
  { table: 'aiPlaygroundSessions', collection: 'aiPlaygroundSessions' },
  { table: 'aiPlaygroundResponses', collection: 'aiPlaygroundResponses' },
  { table: 'aiRoutingDecisions', collection: 'aiRoutingDecisions' },
  { table: 'aiBenchmarkExecutions', collection: 'aiBenchmarkExecutions' },
];

/** JSON-serialisable column name used for nested objects / arrays inside records. */
const PAYLOAD_COL = 'payload';

/** Columns common to every table. */
const COMMON_COLS = 'id TEXT PRIMARY KEY, createdAt TEXT, updatedAt TEXT';

/** Build the CREATE TABLE statement for every collection. */
function createSchemaSql(): string {
  return COLLECTIONS.map(
    ({ table }) =>
      `CREATE TABLE IF NOT EXISTS ${table} (
        ${COMMON_COLS},
        ${PAYLOAD_COL} TEXT NOT NULL DEFAULT '{}'
      );`,
  ).join('\n');
}

/* ========================================================================
   SQLite storage adapter using sql.js (pure WASM, no native build)
   ======================================================================== */

export class SqliteStorageAdapter {
  readonly name = 'sqlite';
  private _db: SqlJsDatabase | null = null;
  private _dbStore: Database = emptyDatabase();
  private writeTimer: NodeJS.Timeout | null = null;

  private get dataDir(): string {
    return path.resolve(process.env.TESTPILOT_DATA_DIR ?? './data');
  }

  private get dbFile(): string {
    return path.join(this.dataDir, 'testpilot.sqlite');
  }

  /** Persist the in-memory SQLite database to the .sqlite file atomically. */
  private persistToFile(): void {
    if (!this._db) return;
    fs.mkdirSync(this.dataDir, { recursive: true });
    const data = this._db.export();
    const tmp = `${this.dbFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, this.dbFile);
  }

  async load(): Promise<Database> {
    fs.mkdirSync(this.dataDir, { recursive: true });

    let existing: Uint8Array | null = null;
    if (fs.existsSync(this.dbFile)) {
      existing = fs.readFileSync(this.dbFile);
    }

    // sql.js pure WASM; load the WASM binary from the package.
    const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default;
    const SQL = await initSqlJs();

    const database = new (SQL as any).Database(existing);
    database.exec(createSchemaSql());
    this._db = database;

    // Populate internal JS state from SQLite (same pattern as JsonStorageAdapter).
    this._dbStore = this.toDatabase();
    return this._dbStore;
  }

  /** Convert all SQLite rows into the in-memory Database shape. */
  private toDatabase(): Database {
    const out: Database = {
      workspaces: [],
      users: [],
      sessions: [],
      projects: [],
      suites: [],
      cases: [],
      runs: [],
      bugs: [],
      workflows: [],
      schedules: [],
      collections: [],
      perfRuns: [],
      securityScans: [],
      integrations: [],
      approvals: [],
      agentRuns: [],
      audit: [],
      reports: [],
      benchmarks: [],
      aiProviders: [],
      aiModels: [],
      providerHealthChecks: [],
      providerConnectionTests: [],
      providerActivities: [],
      aiRoutingConfig: [],
      aiPlaygroundSessions: [],
      aiPlaygroundResponses: [],
      aiRoutingDecisions: [],
      aiBenchmarkExecutions: [],
    };

    if (!this._db) return out;

    for (const { table, collection } of COLLECTIONS) {
      const result = this._db.exec(`SELECT ${PAYLOAD_COL} FROM ${table}`) as any[];
      const values = result[0]?.values ?? [];
      for (const row of values) {
        const parsed = JSON.parse(String(row[0])) as unknown;
        (out[collection] as unknown[]).push(parsed);
      }
    }

    return out;
  }

  /** Persist the entire in-memory Database to SQLite inside one transaction. */
  private fromDatabase(input: Database): void {
    if (!this._db) return;

    this._db.exec('BEGIN TRANSACTION;');
    try {
      for (const { table, collection } of COLLECTIONS) {
        this._db.exec(`DELETE FROM ${table};`);
        const stmt = this._db.prepare(
          `INSERT INTO ${table} (id, createdAt, updatedAt, ${PAYLOAD_COL}) VALUES (?, ?, ?, ?);`,
        );
        const nowTs = new Date().toISOString();
        const rows = (input[collection] as unknown[]) ?? [];
        for (const row of rows) {
          const obj = row as Record<string, unknown>;
          const id = String(obj.id ?? '');
          const createdAt = String(obj.createdAt ?? nowTs);
          const updatedAt = String(obj.updatedAt ?? nowTs);
          const payload = JSON.stringify(obj);
          stmt.run([id, createdAt, updatedAt, payload]);
        }
        stmt.free();
      }
      this._db.exec('COMMIT;');
    } catch (err) {
      try {
        this._db.exec('ROLLBACK;');
      } catch {
        /* ignore rollback errors */
      }
      throw err;
    }
  }

  /** Replace the entire in-memory database (called once on load). */
  setDatabase(input: Database): void {
    this._dbStore = input;
    this.fromDatabase(input);
  }

  /** Get the active in-memory database (mirrors JsonStorageAdapter.db). */
  get db(): Database {
    return this._dbStore;
  }

  /** Replace the in-memory database. */
  replaceDatabase(input: Database): void {
    this._dbStore = input;
    this.fromDatabase(input);
  }

  saveDb(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flushDb(), 40);
  }

  flushDb(): void {
    this.writeTimer = null;
    // Always sync in-memory JS state to SQLite, then persist to file.
    this.fromDatabase(this._dbStore);
    this.persistToFile();
  }

  /** Persist immediately even if not dirty (used on shutdown / migration verification). */
  forceFlush(): void {
    this.writeTimer = null;
    this.fromDatabase(this._dbStore);
    this.persistToFile();
  }

  audit(
    workspaceId: string,
    actor: string,
    action: string,
    target?: string,
    meta?: Record<string, unknown>,
    ip?: string,
  ): void {
    if (!this._db) throw new Error('SQLite adapter not initialised');
    this._dbStore.audit.unshift({
      id: `aud_${randomBytes(6).toString('hex')}`,
      workspaceId,
      actor,
      action,
      target,
      meta,
      ip,
      createdAt: new Date().toISOString(),
    });
    if (this._dbStore.audit.length > 5000) this._dbStore.audit.length = 5000;
    this.saveDb();
  }

  pruneSessions(): void {
    if (!this._db) throw new Error('SQLite adapter not initialised');
    const cutoff = Date.now();
    const before = this._dbStore.sessions.length;
    this._dbStore.sessions = this._dbStore.sessions.filter(
      (s) => new Date((s as Session).expiresAt).getTime() > cutoff,
    );
    if (before !== this._dbStore.sessions.length) {
      this.saveDb();
    }
  }

  close(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    try {
      this._db?.close();
    } catch {
      /* ignore close errors */
    }
    this._db = null;
  }

  /** Get raw SQLite Database instance (for migration script / integrity checks). */
  get rawDb(): SqlJsDatabase | null {
    return this._db;
  }
}
