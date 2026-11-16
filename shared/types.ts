/** Shared domain contracts used by the API server and the web client. */

export type Role = 'owner' | 'admin' | 'qa_lead' | 'tester' | 'viewer';
export type Plan = 'free' | 'pro' | 'ultimate' | 'business';

export type TestType =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'regression'
  | 'smoke'
  | 'acceptance'
  | 'api'
  | 'ui'
  | 'database'
  | 'accessibility'
  | 'visual'
  | 'performance'
  | 'security'
  | 'cross-browser';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  ownerId: string;
  aiApprovalsRequired: boolean;
  allowedHosts: string[];
  createdAt: string;
}

export interface User {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  role: Role;
  passwordHash?: string;
  createdAt: string;
  lastSeenAt?: string;
  mustChangePassword?: boolean;
}

export interface Session {
  id: string;
  userId: string;
  workspaceId: string;
  csrf: string;
  expiresAt: string;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string;
  repoUrl?: string;
  baseUrl?: string;
  environment: 'development' | 'staging' | 'production';
  allowedHosts: string[];
  createdAt: string;
  qualityScore?: number;
  /** active = normal, archived = read-only wrapper (excluded from default lists of pickers) */
  status?: 'active' | 'archived';
  archivedAt?: string;
}

export interface TestSuite {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  type: TestType;
  description: string;
  tags: string[];
  createdAt: string;
}

export interface ApiRequestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
  assertions?: {
    status?: number;
    statusIn?: number[];
    maxLatencyMs?: number;
    contains?: string;
    header?: { name: string; includes: string };
    jsonPath?: { path: string; equals: unknown };
  };
}

export interface TestCase {
  id: string;
  workspaceId: string;
  projectId: string;
  suiteId: string;
  title: string;
  description?: string;
  type: TestType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  automation: 'automated' | 'manual';
  code?: string;
  request?: ApiRequestSpec;
  targetUrl?: string;
  fixture?: unknown;
  steps?: string[];
  expected?: string;
  tags: string[];
  timeoutMs: number;
  enabled: boolean;
  aiGenerated?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ResultStatus = 'not-run' | 'passed' | 'failed' | 'blocked' | 'skipped' | 'error';

export interface RunResult {
  caseId: string;
  title: string;
  type: TestType;
  status: ResultStatus;
  /** Manual execution: what the tester actually observed. */
  actualResult?: string;
  notes?: string;
  attachments?: string[];
  executedBy?: string;
  executedAt?: string;
  durationMs: number;
  message?: string;
  evidence?: string;
  details?: Record<string, unknown>;
  startedAt: string;
}

export interface Run {
  id: string;
  workspaceId: string;
  projectId: string;
  suiteId?: string;
  status: 'draft' | 'queued' | 'running' | 'paused' | 'passed' | 'failed' | 'blocked' | 'cancelled' | 'error' | 'completed';
  /** automated = engine driven, manual = tester driven workspace */
  mode?: 'automated' | 'manual';
  assignee?: string;
  pausedAt?: string;
  resumedAt?: string;
  trigger: 'manual' | 'schedule' | 'webhook' | 'ci';
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  results: RunResult[];
  summary: { total: number; passed: number; failed: number; skipped: number; error: number; blocked?: number; notRun?: number };
  aiAnalysis?: string;
  logs: string[];
}

export interface Bug {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  linkedRunId?: string;
  linkedCaseId?: string;
  assignee?: string;
  reproduction?: string;
  aiRootCause?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  type: 'run-suite' | 'api-request' | 'delay' | 'condition' | 'approval' | 'notify';
  label: string;
  config: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  enabled: boolean;
  steps: WorkflowStep[];
  retry: { attempts: number; backoffMs: number };
  parallel: boolean;
  timeoutMs: number;
  createdAt: string;
  lastRunAt?: string;
}

export interface Schedule {
  id: string;
  workspaceId: string;
  projectId: string;
  suiteId: string;
  name: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt?: string;
  createdAt: string;
}

export interface ApiCollection {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  environment: Record<string, string>;
  requests: Array<{ id: string; name: string; spec: ApiRequestSpec; lastResponse?: ApiResponseResult }>;
  createdAt: string;
}

export interface ApiResponseResult {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  bodySnippet: string;
  size: number;
}

export interface PerfRun {
  id: string;
  workspaceId: string;
  projectId: string;
  url: string;
  method: 'GET';
  requests: number;
  concurrency: number;
  status: 'completed' | 'failed' | 'running';
  metrics?: {
    rps: number;
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    max: number;
    min: number;
    errors: number;
    errorRate: number;
  };
  createdAt: string;
}

export interface SecurityFinding {
  id: string;
  title: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence?: string;
  remediation: string;
}

export interface SecurityScan {
  id: string;
  workspaceId: string;
  projectId: string;
  url: string;
  score: number;
  findings: SecurityFinding[];
  createdAt: string;
}

export interface Integration {
  id: string;
  workspaceId: string;
  name: string;
  category: 'repository' | 'ci' | 'framework' | 'issue-tracker' | 'webhook';
  status: 'available' | 'configured' | 'unavailable';
  detail: string;
  config?: Record<string, string>;
  createdAt: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  description: string;
  scopes: string[];
  maxRunsPerHour: number;
  requiresApproval: boolean;
}

export interface AgentRun {
  id: string;
  workspaceId: string;
  agentId: string;
  projectId?: string;
  input: string;
  status: 'queued' | 'awaiting_approval' | 'completed' | 'failed' | 'rejected';
  output?: string;
  artifacts?: string[];
  approvedBy?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface Approval {
  id: string;
  workspaceId: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actor: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

/* ====================================================== AI benchmarking */

export type AiProviderKind = 'local' | 'ollama' | 'openai-compatible';

/** The model/provider under test for a benchmark run. */
export interface BenchmarkTarget {
  kind: AiProviderKind;
  /** Model identifier as reported by the provider layer (null when unconfigured). */
  model: string | null;
  /** Whether the provider layer reports it usable at run time. */
  available: boolean;
}

export interface BenchmarkCaseResult {
  id: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  latencyMs?: number;
}

export interface BenchmarkSuiteResult {
  suiteId: string;
  name: string;
  capability: string;
  metrics: Record<string, number>;
  cases: BenchmarkCaseResult[];
  latency: { avgMs: number; medianMs: number; p95Ms: number; p99Ms: number; samples: number };
  errors: number;
  notes: string[];
}

export interface BenchmarkRun {
  id: string;
  workspaceId: string;
  label?: string;
  target: BenchmarkTarget;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  /** Hash of the fixture set + suite ids so historical runs stay reproducible. */
  configHash: string;
  suites: BenchmarkSuiteResult[];
  overall: {
    passRate: number;
    accuracy: number;
    consistency: number;
    errorRate: number;
    malformedJsonRate: number;
    hallucinationRate: number;
    avgLatencyMs: number;
  };
  resource: { ramDeltaKb?: number; cpuDeltaMs?: number };
  notes: string[];
}

export interface BenchmarkLeaderboardEntry {
  target: BenchmarkTarget;
  runId: string;
  score: number;
  parts: { quality: number; reliability: number; speed: number; robustness: number };
  passRate: number;
  avgLatencyMs: number;
  evaluatedAt: string;
}

/* ====================================================== AI provider management (Phase 40) */

/** A configured AI provider. Credentials are encrypted at rest and never returned in API responses. */
export interface AiProviderConfig {
  id: string;
  workspaceId: string;
  name: string;           // User-facing display name
  kind: AiProviderKind;   // local | ollama | openai-compatible
  baseUrl?: string;       // Required for ollama / openai-compatible
  model?: string;         // Default model identifier
  enabled: boolean;
  /** Connection parameters (timeout, etc.) — never secrets. */
  connectionParams?: Record<string, string>;
  /** Whether credentials (API key, etc.) have been configured for this provider. */
  credentialsConfigured: boolean;
  /** Estimated cost per 1K tokens, when verified from provider docs. */
  costPer1kTokens?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/** Entry in the central AI model registry. Capabilities are verified, never invented. */
export interface AiModel {
  id: string;
  workspaceId: string;
  providerId: string;
  name: string;           // User-facing name
  identifier: string;     // Model identifier used in provider API calls
  type: 'chat' | 'completion' | 'embedding';
  version?: string;
  /** Context window size, only when verified by discovery or docs. */
  contextWindow?: number;
  /** Capabilities actually verified (not inferred). */
  capabilities: string[];
  inputFormats: string[];   // e.g. ['text', 'json']
  outputFormats: string[];  // e.g. ['text', 'json']
  toolCalling: boolean;
  streaming: boolean;
  enabled: boolean;
  /** Whether this model can be used as a benchmark target. */
  benchmarkEligible: boolean;
  lastHealthCheck?: ProviderHealthResult;
  createdAt: string;
  updatedAt: string;
}

/** Result of a provider health check. */
export interface ProviderHealthResult {
  providerId: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  checkedAt: string;
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

/** Result of a provider connection test. */
export interface ProviderConnectionTest {
  id: string;
  providerId: string;
  testedAt: string;
  dnsReachable: boolean;
  endpointAvailable: boolean;
  authenticationOk: boolean;
  modelAvailable: boolean;
  validResponse: boolean;
  streamingSupported: boolean;
  structuredOutputSupported: boolean;
  timeoutMs: number;
  rateLimitInfo?: { remaining?: number; resetAt?: string };
  error?: string;
}

/** Provider activity / audit history entry. */
export interface ProviderActivity {
  id: string;
  workspaceId: string;
  providerId?: string;
  action: string;          // e.g. 'provider.created', 'connection.test', 'model.discovered'
  target?: string;
  success: boolean;
  latencyMs?: number;
  error?: string;
  createdAt: string;
}

/** Routing rule: which provider handles a task category. */
export interface AiRoutingRule {
  id: string;
  workspaceId: string;
  taskCategory: string;    // e.g. 'case-generation', 'failure-triage', 'assistant', 'benchmark'
  providerId: string;      // Preferred provider
  fallbackProviderId?: string;
  enabled: boolean;
  createdAt: string;
}

/** Intelligent routing configuration. */
export interface AiRoutingConfig {
  id: string;
  workspaceId: string;
  defaultProviderId: string | null;
  rules: AiRoutingRule[];
  timeoutMs: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

/** A routing decision made at execution time. */
export interface AiRoutingDecision {
  id: string;
  workspaceId: string;
  taskCategory: string;
  providerId: string;
  fallbackProviderId?: string;
  selectedProviderId: string;
  reason: string;          // why this provider was selected
  latencyMs?: number;
  success: boolean;
  error?: string;
  createdAt: string;
}

/** Sanitised provider config returned to the frontend (credentials never included). */
export interface AiProviderConfigPublic {
  id: string;
  workspaceId: string;
  name: string;
  kind: AiProviderKind;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  connectionParams?: Record<string, string>;
  credentialsConfigured: boolean;
  costPer1kTokens?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/** Masked credential value for UI display. */
export interface CredentialField {
  name: string;
  /** Masked value safe for UI display, e.g. "sk-…abcd" or "***". */
  masked: string;
  configured: boolean;
}

/* ====================================================== AI playground sessions (Phase 41) */

/** A saved playground session. */
export interface AiPlaygroundSession {
  id: string;
  workspaceId: string;
  name: string;            // User-facing session name
  prompt: string;          // The prompt sent
  systemPrompt?: string;   // Optional system prompt
  createdAt: string;
  updatedAt: string;
}

/** A single model response within a playground session. */
export interface AiPlaygroundResponse {
  id: string;
  sessionId: string;
  providerId: string;
  providerKind: AiProviderKind;
  model: string;
  response: string | null;
  latencyMs: number;
  error?: string;
  createdAt: string;
}

/* ====================================================== AI benchmark execution tracking (Phase 41) */

/** A multi-model benchmark execution record. */
export interface AiBenchmarkExecution {
  id: string;
  workspaceId: string;
  label?: string;
  configHash: string;      // Same as Phase 39 — ensures fixture compatibility
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  /** Per-provider results. */
  results: AiBenchmarkExecutionResult[];
  notes: string[];
}

/** Result of one provider within a benchmark execution. */
export interface AiBenchmarkExecutionResult {
  providerId: string;
  providerKind: AiProviderKind;
  model: string;
  benchmarkRunId?: string; // Links to Phase 39 BenchmarkRun if available
  passRate?: number;
  avgLatencyMs?: number;
  error?: string;
  completedAt?: string;
}

export interface Report {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  kind: 'execution' | 'quality' | 'release';
  summary: string;
  data: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface Entitlements {
  plan: Plan;
  seats: number;
  projects: number;
  runsPerMonth: number;
  aiAssistsPerDay: number;
  features: string[];
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  error: number;
  blocked?: number;
  notRun?: number;
}
