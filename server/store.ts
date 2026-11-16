import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ApiCollection,
  Approval,
  AiBenchmarkExecution,
  AiModel,
  AiPlaygroundResponse,
  AiPlaygroundSession,
  AiProviderConfig,
  AiRoutingConfig,
  AiRoutingDecision,
  AuditEvent,
  BenchmarkRun,
  Bug,
  Integration,
  PerfRun,
  Project,
  ProviderActivity,
  ProviderConnectionTest,
  ProviderHealthResult,
  Report,
  Run,
  Schedule,
  SecurityScan,
  Session,
  TestCase,
  TestSuite,
  User,
  Workflow,
  Workspace,
  AgentRun,
} from '../shared/types.js';

/* ========================================================================
   Database shape (canonical domain model, shared by all adapters)
   ======================================================================== */

export interface Database {
  workspaces: Workspace[];
  users: User[];
  sessions: Session[];
  projects: Project[];
  suites: TestSuite[];
  cases: TestCase[];
  runs: Run[];
  bugs: Bug[];
  workflows: Workflow[];
  schedules: Schedule[];
  collections: ApiCollection[];
  perfRuns: PerfRun[];
  securityScans: SecurityScan[];
  integrations: Integration[];
  approvals: Approval[];
  agentRuns: AgentRun[];
  audit: AuditEvent[];
  reports: Report[];
  benchmarks: BenchmarkRun[];
  aiProviders: AiProviderConfig[];
  aiModels: AiModel[];
  providerHealthChecks: ProviderHealthResult[];
  providerConnectionTests: ProviderConnectionTest[];
  providerActivities: ProviderActivity[];
  aiRoutingConfig: AiRoutingConfig[];
  aiPlaygroundSessions: AiPlaygroundSession[];
  aiPlaygroundResponses: AiPlaygroundResponse[];
  aiRoutingDecisions: AiRoutingDecision[];
  aiBenchmarkExecutions: AiBenchmarkExecution[];
}

/* ========================================================================
   Storage adapter interface
   ======================================================================== */

export interface StorageAdapter {
  /** Name of the adapter (for logging / health endpoint). */
  readonly name: string;
  /** Load the database from disk into memory. Returns the populated Database. */
  load(): Promise<Database>;
  /** Persist the in-memory database to disk (debounced). */
  saveDb(): void;
  /** Persist the in-memory database to disk immediately. */
  flushDb(): void;
  /** Append an audit event and persist. */
  audit(
    workspaceId: string,
    actor: string,
    action: string,
    target?: string,
    meta?: Record<string, unknown>,
    ip?: string,
  ): void;
  /** Remove expired sessions from memory and persist if changed. */
  pruneSessions(): void;
  /** Close the adapter (release WASM / file handles). */
  close?(): void;
}

/* ========================================================================
   Shared utilities (not storage-specific)
   ======================================================================== */

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString('hex')}`;
}

export function now(): string {
  return new Date().toISOString();
}

/* ========================================================================
   JSON file storage adapter (existing behaviour, preserved exactly)
   ======================================================================== */

export const emptyDatabase = (): Database => ({
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
});

export class JsonStorageAdapter implements StorageAdapter {
  readonly name = 'json-file';
  private db: Database = emptyDatabase();
  private writeTimer: NodeJS.Timeout | null = null;

  private get dataDir(): string {
    return path.resolve(process.env.TESTPILOT_DATA_DIR ?? './data');
  }

  private get dbFile(): string {
    return path.join(this.dataDir, 'testpilot.json');
  }

  async load(): Promise<Database> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.dbFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.dbFile, 'utf8')) as Partial<Database>;
        this.db = { ...emptyDatabase(), ...parsed };
      } catch (err) {
        console.error('[testpilot] database unreadable, starting fresh copy', err);
        this.db = emptyDatabase();
      }
    }
    return this.db;
  }

  saveDb(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flushDb(), 40);
  }

  flushDb(): void {
    this.writeTimer = null;
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.dbFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), 'utf8');
    fs.renameSync(tmp, this.dbFile);
  }

  audit(
    workspaceId: string,
    actor: string,
    action: string,
    target?: string,
    meta?: Record<string, unknown>,
    ip?: string,
  ): void {
    this.db.audit.unshift({
      id: id('aud'),
      workspaceId,
      actor,
      action,
      target,
      meta,
      ip,
      createdAt: now(),
    });
    if (this.db.audit.length > 5000) this.db.audit.length = 5000;
    this.saveDb();
  }

  pruneSessions(): void {
    const cutoff = Date.now();
    const before = this.db.sessions.length;
    this.db.sessions = this.db.sessions.filter((s) => new Date(s.expiresAt).getTime() > cutoff);
    if (before !== this.db.sessions.length) this.saveDb();
  }

  close(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
  }
}

/* ========================================================================
   Module-level state (backward-compatible API surface)
   ======================================================================== */

let adapter: StorageAdapter;
let db: Database = emptyDatabase();

/** Returns the active adapter name (used by /api/health). */
export function storageAdapterName(): string {
  return adapter.name;
}

/** Returns the in-memory database (mutated directly by routes). */
export function getDb(): Database {
  return db;
}

/** Initialises the storage adapter based on TESTPILOT_STORAGE env var. */
export async function loadDb(): Promise<Database> {
  const storageType = (process.env.TESTPILOT_STORAGE ?? 'json').toLowerCase();
  if (storageType === 'sqlite') {
    const { SqliteStorageAdapter } = await import('./store-sqlite.js');
    adapter = new SqliteStorageAdapter();
  } else {
    adapter = new JsonStorageAdapter();
  }
  db = await adapter.load();
  return db;
}

/** Debounced persist to the active adapter. */
export function saveDb(): void {
  adapter.saveDb();
}

/** Immediate persist to the active adapter. */
export function flushDb(): void {
  adapter.flushDb();
}

/** Append an audit event via the active adapter. */
export function audit(
  workspaceId: string,
  actor: string,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
  ip?: string,
): void {
  adapter.audit(workspaceId, actor, action, target, meta, ip);
}

/** Remove expired sessions via the active adapter. */
export function pruneSessions(): void {
  adapter.pruneSessions();
}

/** Close the active adapter (graceful shutdown). */
export function closeStorage(): void {
  adapter.close?.();
}
