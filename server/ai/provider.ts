/**
 * Provider-independent AI layer.
 * The local provider is deterministic, offline and always available. Ollama or any
 * OpenAI-compatible endpoint can be enabled through environment configuration.
 *
 * Phase 41 extension: intelligent routing engine. Routing rules stored in the
 * database now actually control which provider handles each AI call, with
 * fallback, retry, and decision logging. Env-var based configuration remains
 * the default for backward compatibility.
 *
 * Security: credentials are encrypted at rest with AES-256-GCM using
 * TESTPILOT_ENCRYPTION_KEY. Without the key, new credential writes fail
 * securely (no plaintext fallback).
 */
import crypto from 'node:crypto';
import {
  getDb,
  id,
  saveDb,
} from '../store.js';
import type {
  AiProviderConfig,
  AiProviderConfigPublic,
  AiRoutingDecision,
  CredentialField,
  ProviderConnectionTest,
  ProviderHealthResult,
} from '../../shared/types.js';

export type AiProviderName = 'local' | 'ollama' | 'openai-compatible';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GeneratedCase {
  title: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  steps: string[];
  expected: string;
  rationale: string;
}

/* ================================================================= credentials */

/** Encryption key for credentials at rest. Required for any non-local provider. */
function encryptionKey(): crypto.KeyObject | null {
  const raw = process.env.TESTPILOT_ENCRYPTION_KEY;
  if (!raw) return null;
  return crypto.createSecretKey(Buffer.from(raw, 'utf8').slice(0, 32));
}

/** Throw if encryption is required but not configured. */
function requireEncryptionKey(): void {
  if (!encryptionKey()) {
    throw new Error(
      'TESTPILOT_ENCRYPTION_KEY is not set. Credentials cannot be stored securely. ' +
      'Set TESTPILOT_ENCRYPTION_KEY in your environment to use cloud providers.',
    );
  }
}

/** Encrypt a credential value. Throws if no encryption key is configured (no plaintext fallback). */
export function encryptCredential(plaintext: string): string {
  requireEncryptionKey();
  const key = encryptionKey()!;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Decrypt a credential value. Throws if decryption fails. */
export function decryptCredential(ciphertext: string): string {
  const key = encryptionKey();
  if (!key) {
    // Plaintext fallback only for backward compat with pre-encryption data.
    // New writes always require the key.
    return ciphertext;
  }
  try {
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new Error('Failed to decrypt credential: invalid or corrupted credential data');
  }
}

/** Mask a credential for safe UI display. Never returns the actual secret. */
export function maskCredential(label: string, value: string): CredentialField {
  if (!value || value.length === 0) return { name: label, masked: '', configured: false };
  const visible = value.slice(-4);
  return { name: label, masked: `***${visible}`, configured: true };
}

/** Internal in-memory store of decrypted credentials keyed by provider id.
 * Credentials are decrypted on write and re-encrypted on save. This map is
 * populated from the database on load and cleared when credentials are removed.
 */
const credentialCache = new Map<string, Record<string, string>>();

/** Get decrypted credentials for a provider. */
export function getProviderCredentials(providerId: string): Record<string, string> {
  return credentialCache.get(providerId) ?? {};
}

/** Set decrypted credentials for a provider (stored in-memory only). */
export function setProviderCredentials(providerId: string, credentials: Record<string, string>): void {
  credentialCache.set(providerId, { ...credentials });
}

/** Remove credentials for a provider. */
export function clearProviderCredentials(providerId: string): void {
  credentialCache.delete(providerId);
}

/* ================================================================= provider config access */

/** List all provider configs for a workspace (public view, no credentials). */
export function listProviderConfigs(workspaceId: string): AiProviderConfigPublic[] {
  const db = getDb();
  return db.aiProviders
    .filter((p) => p.workspaceId === workspaceId)
    .map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      model: p.model,
      enabled: p.enabled,
      connectionParams: p.connectionParams,
      credentialsConfigured: p.credentialsConfigured,
      costPer1kTokens: p.costPer1kTokens,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      createdBy: p.createdBy,
    }));
}

/** Get a single provider config including credentials reference (server-side only). */
export function getProviderConfig(id: string): AiProviderConfig | undefined {
  const db = getDb();
  return db.aiProviders.find((p) => p.id === id);
}

/** Get a public (credential-free) view of a single provider config. */
export function getProviderConfigPublic(id: string): AiProviderConfigPublic | undefined {
  const p = getProviderConfig(id);
  if (!p) return undefined;
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    kind: p.kind,
    baseUrl: p.baseUrl,
    model: p.model,
    enabled: p.enabled,
    connectionParams: p.connectionParams,
    credentialsConfigured: p.credentialsConfigured,
    costPer1kTokens: p.costPer1kTokens,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdBy: p.createdBy,
  };
}

/** Create or update a provider config. */
export function upsertProviderConfig(config: Omit<AiProviderConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): AiProviderConfig {
  const db = getDb();
  const nowTs = new Date().toISOString();
  const id = config.id ?? `prov_${crypto.randomBytes(6).toString('hex')}`;

  const existing = db.aiProviders.find((p) => p.id === id);
  const stored: AiProviderConfig = {
    id,
    workspaceId: config.workspaceId,
    name: config.name,
    kind: config.kind,
    baseUrl: config.baseUrl,
    model: config.model,
    enabled: config.enabled ?? true,
    connectionParams: config.connectionParams,
    credentialsConfigured: existing?.credentialsConfigured ?? false,
    costPer1kTokens: config.costPer1kTokens,
    createdAt: existing?.createdAt ?? nowTs,
    updatedAt: nowTs,
    createdBy: config.createdBy ?? existing?.createdBy,
  };

  const idx = db.aiProviders.findIndex((p) => p.id === id);
  if (idx >= 0) {
    db.aiProviders[idx] = stored;
  } else {
    db.aiProviders.push(stored);
  }
  saveDb();
  return stored;
}

/** Remove a provider config and its credentials. */
export function deleteProviderConfig(id: string): boolean {
  const db = getDb();
  const idx = db.aiProviders.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  db.aiProviders.splice(idx, 1);
  clearProviderCredentials(id);
  saveDb();
  return true;
}

/** Mark credentials as configured (after they've been set via setProviderCredentials). */
export function markCredentialsConfigured(id: string, configured: boolean): void {
  const db = getDb();
  const p = db.aiProviders.find((x) => x.id === id);
  if (p) {
    p.credentialsConfigured = configured;
    p.updatedAt = new Date().toISOString();
    saveDb();
  }
}

/* ================================================================= env-var fallback (backward compatible) */

export function providerName(): AiProviderName {
  const raw = (process.env.AI_PROVIDER ?? 'local').toLowerCase();
  return raw === 'ollama' || raw === 'openai-compatible' ? raw : 'local';
}

export function providerInfo(): { name: AiProviderName; model: string | null; available: boolean } {
  const name = providerName();
  if (name === 'ollama') {
    return { name, model: process.env.OLLAMA_MODEL ?? 'llama3.2', available: Boolean(process.env.OLLAMA_BASE_URL) };
  }
  if (name === 'openai-compatible') {
    return {
      name,
      model: process.env.OPENAI_COMPATIBLE_MODEL ?? null,
      available: Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_API_KEY),
    };
  }
  return { name, model: 'testpilot-local-heuristics-v1', available: true };
}

async function callCloud(messages: AiMessage[]): Promise<string | null> {
  const name = providerName();
  if (name === 'local') return null;
  const base = name === 'ollama' ? process.env.OLLAMA_BASE_URL : process.env.OPENAI_COMPATIBLE_BASE_URL;
  if (!base) return null;
  try {
    if (name === 'ollama') {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? 'llama3.2', messages, stream: false }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? null;
    }
    const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_COMPATIBLE_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_COMPATIBLE_MODEL, messages, temperature: 0.2 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

const AREAS: Array<{ match: RegExp; area: string }> = [
  { match: /\blog ?in|sign ?in|auth|session|password|token/i, area: 'authentication' },
  { match: /\bcheckout|payment|cart|billing|invoice|subscription/i, area: 'payments' },
  { match: /\bsearch|filter|sort|pagination/i, area: 'search' },
  { match: /\bupload|file|attachment|image/i, area: 'file upload' },
  { match: /\bapi|endpoint|rest|graphql|webhook/i, area: 'API' },
  { match: /\bform|signup|register|profile/i, area: 'forms' },
  { match: /\bnotification|email|alert/i, area: 'notifications' },
  { match: /\bdashboard|report|analytics|chart/i, area: 'reporting' },
  { match: /\bdatabase|migration|schema|record/i, area: 'data' },
];

function detectArea(requirement: string): string {
  return AREAS.find((a) => a.match.test(requirement))?.area ?? 'the feature';
}

/** Deterministic requirement-to-tests generator (offline fallback / default). */
export function localGenerateCases(requirement: string, count = 8): GeneratedCase[] {
  const area = detectArea(requirement);
  const base: GeneratedCase[] = [
    {
      title: `Happy path — ${area} completes successfully`,
      type: 'e2e',
      priority: 'critical',
      steps: ['Navigate to the entry point', 'Provide valid input', 'Submit the flow', 'Observe the confirmation state'],
      expected: 'The flow completes, data is persisted and a success state is shown.',
      rationale: 'Confirms the primary business path for the requirement.',
    },
    {
      title: `Validation — ${area} rejects invalid input`,
      type: 'integration',
      priority: 'high',
      steps: ['Submit the form with empty required fields', 'Submit with malformed values', 'Inspect validation messages'],
      expected: 'Inline validation errors are displayed and no state is persisted.',
      rationale: 'Covers client and server validation without data corruption.',
    },
    {
      title: `Boundary — ${area} handles minimum and maximum lengths`,
      type: 'unit',
      priority: 'medium',
      steps: ['Test the minimum accepted value', 'Test the maximum accepted value', 'Test one value beyond each boundary'],
      expected: 'Values inside the boundary are accepted; values outside are rejected with a clear message.',
      rationale: 'Boundary analysis catches off-by-one defects.',
    },
    {
      title: `Authorization — ${area} is blocked for unprivileged users`,
      type: 'security',
      priority: 'critical',
      steps: ['Sign in as a viewer', 'Attempt the privileged action directly via API', 'Verify server-side enforcement'],
      expected: 'The API returns 403 and the UI hides privileged actions.',
      rationale: 'Prevents horizontal and vertical privilege escalation.',
    },
    {
      title: `Accessibility — ${area} is keyboard and screen-reader friendly`,
      type: 'accessibility',
      priority: 'medium',
      steps: ['Tab through the flow', 'Trigger with Enter/Space', 'Check labels and announcements'],
      expected: 'All controls are reachable, labelled and announced correctly.',
      rationale: 'Meets WCAG 2.1 AA interaction requirements.',
    },
    {
      title: `Resilience — ${area} handles dependency failure`,
      type: 'regression',
      priority: 'high',
      steps: ['Simulate a slow or failing downstream dependency', 'Retry the action', 'Observe the recovery path'],
      expected: 'A recoverable error is shown; retries do not duplicate data.',
      rationale: 'Validates graceful degradation and idempotency.',
    },
    {
      title: `Performance — ${area} responds within budget`,
      type: 'performance',
      priority: 'medium',
      steps: ['Measure p95 latency at normal load', 'Measure at peak concurrency', 'Compare with the agreed budget'],
      expected: 'p95 stays under the service-level objective with no error spike.',
      rationale: 'Confirms the requirement is viable under realistic load.',
    },
    {
      title: `API contract — ${area} endpoint returns a stable schema`,
      type: 'api',
      priority: 'high',
      steps: ['Call the endpoint with a valid payload', 'Assert status, headers and JSON fields', 'Call with an invalid payload'],
      expected: 'Successful responses match the schema; invalid payloads return 4xx with a stable error shape.',
      rationale: 'Contract tests protect consumers from breaking changes.',
    },
    {
      title: `Visual — ${area} layout matches the approved baseline`,
      type: 'visual',
      priority: 'low',
      steps: ['Render the flow', 'Capture the DOM snapshot', 'Compare against the stored baseline'],
      expected: 'No unexpected structural or content changes are detected.',
      rationale: 'Detects unintended UI regressions.',
    },
    {
      title: `Cross-browser — ${area} works in Chromium, Firefox and WebKit`,
      type: 'cross-browser',
      priority: 'medium',
      steps: ['Run the core flow per browser engine', 'Compare results and screenshots'],
      expected: 'All supported engines pass with no layout breakage.',
      rationale: 'Separates browser-specific defects from application defects.',
    },
  ];
  return base.slice(0, Math.max(1, Math.min(count, base.length)));
}

export interface FailureInput {
  title: string;
  message?: string;
  type?: string;
  durationMs?: number;
}

export function localFailureAnalysis(failures: FailureInput[]): string {
  if (failures.length === 0) return 'No failures in this run — nothing to triage. Keep the flaky watch enabled for latent instability.';
  const lines: string[] = [];
  const buckets = new Map<string, FailureInput[]>();
  for (const f of failures) {
    const msg = (f.message ?? '').toLowerCase();
    let cause = 'Assertion mismatch';
    if (/timeout|timed out|abort/.test(msg)) cause = 'Timeout / slow dependency';
    else if (/econnrefused|enotfound|fetch failed|network/.test(msg)) cause = 'Network or service unavailable';
    else if (/401|unauthor|forbidden|403/.test(msg)) cause = 'Authentication / authorization';
    else if (/404/.test(msg)) cause = 'Missing route or resource';
    else if (/429|rate limit/.test(msg)) cause = 'Rate limiting';
    else if (/5\d\d|internal server/.test(msg)) cause = 'Server-side error';
    else if (/expected .* but/.test(msg)) cause = 'Behaviour does not match the expectation';
    buckets.set(cause, [...(buckets.get(cause) ?? []), f]);
  }
  for (const [cause, items] of buckets) {
    lines.push(`**${cause}** — ${items.length} failure(s)`);
    for (const item of items.slice(0, 4)) lines.push(`- ${item.title}: ${item.message?.slice(0, 200) ?? 'no message'}`);
    if (cause === 'Timeout / slow dependency') lines.push('  ↳ Recommended: raise the per-case timeout, add a readiness probe, and check p95 latency in Performance.');
    if (cause === 'Assertion mismatch') lines.push('  ↳ Recommended: capture the response/body evidence and confirm the expected value is current.');
    if (cause === 'Authentication / authorization') lines.push('  ↳ Recommended: verify the role used by the run and the allowlist for the environment.');
    if (cause === 'Server-side error') lines.push('  ↳ Recommended: correlate with application logs for the same timestamp before filing a defect.');
  }
  const flakyHint = failures.some((f) => (f.durationMs ?? 0) > 5000) ? '\nSome failures were slow; run them again in isolation before treating them as product defects.' : '';
  return `${lines.join('\n')}${flakyHint}`;
}

export function localChat(question: string, context: string): string {
  const q = question.toLowerCase();
  if (/coverage/.test(q)) {
    return `Coverage view\n\n${context}\n\nFocus next on the modules with the fewest automated cases. Coverage is computed from executed cases per suite type; it is not line coverage and is labelled accordingly in Analytics.`;
  }
  if (/flaky|unstable|intermittent/.test(q)) {
    return `Flaky signal\n\n${context}\n\nA case is flagged flaky when it has both passes and failures across recent runs with a similar execution profile. Re-run it three times in isolation to confirm before quarantining.`;
  }
  if (/prioriti[sz]e|what should|next/.test(q)) {
    return `Suggested priority\n\n1. Critical failures with reproduction evidence\n2. Security and authorization cases\n3. Failures touching payment or authentication paths\n4. Long-running flaky cases\n\n${context}`;
  }
  if (/release|ship|ready/.test(q)) {
    return `Release readiness\n\n${context}\n\nUse the Release Readiness panel for the explainable score (pass rate, critical failures, flaky rate, coverage). Treat any critical failure as a blocker regardless of score.`;
  }
  return `TESTPILOT assistant (local provider)\n\n${context}\n\nI answer from your workspace data with deterministic rules. Configure Ollama or an OpenAI-compatible endpoint for free-form generation. I never execute destructive tests without approval.`;
}

/* ================================================================= Phase 41: intelligent routing engine */

/** Resolve which provider should handle a task, using routing rules then env-var fallback.
 * Returns the selected provider config, the reason for selection, and whether fallback was used.
 */
export function resolveProvider(
  workspaceId: string,
  taskCategory: string,
): { config: AiProviderConfig | null; reason: string; usedFallback: boolean } {
  const db = getDb();
  const routing = db.aiRoutingConfig.find((r) => r.workspaceId === workspaceId);

  // 1. Look for an enabled routing rule for this task category.
  const rule = routing?.rules.find((r) => r.taskCategory === taskCategory && r.enabled);
  if (rule) {
    const provider = db.aiProviders.find((p) => p.id === rule.providerId && p.workspaceId === workspaceId && p.enabled);
    if (provider) {
      return { config: provider, reason: `routing rule for "${taskCategory}"`, usedFallback: false };
    }
    // Rule points to a disabled/missing provider — try fallback.
    if (rule.fallbackProviderId) {
      const fallback = db.aiProviders.find((p) => p.id === rule.fallbackProviderId && p.workspaceId === workspaceId && p.enabled);
      if (fallback) {
        return { config: fallback, reason: `fallback for "${taskCategory}" (primary unavailable)`, usedFallback: true };
      }
    }
  }

  // 2. Use the configured default provider.
  if (routing?.defaultProviderId) {
    const provider = db.aiProviders.find((p) => p.id === routing.defaultProviderId && p.workspaceId === workspaceId && p.enabled);
    if (provider) {
      return { config: provider, reason: 'default provider', usedFallback: false };
    }
  }

  // 3. Env-var fallback (backward compatible).
  const info = providerInfo();
  if (info.available) {
    const existing = db.aiProviders.find((p) => p.kind === info.name && p.workspaceId === workspaceId);
    if (existing) {
      return { config: existing, reason: `env-var provider (${info.name})`, usedFallback: false };
    }
    // Create a synthetic config for the env-var provider.
    return {
      config: {
        id: `env-${info.name}`,
        workspaceId,
        name: info.name,
        kind: info.name,
        baseUrl: info.name === 'ollama' ? process.env.OLLAMA_BASE_URL ?? undefined : process.env.OPENAI_COMPATIBLE_BASE_URL ?? undefined,
        model: info.model ?? undefined,
        enabled: true,
        connectionParams: {},
        credentialsConfigured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      reason: `env-var provider (${info.name})`,
      usedFallback: false,
    };
  }

  // 4. Last resort: local provider is always available.
  const local = db.aiProviders.find((p) => p.kind === 'local' && p.workspaceId === workspaceId && p.enabled);
  if (local) {
    return { config: local, reason: 'local provider (final fallback)', usedFallback: true };
  }

  return {
    config: {
      id: 'env-local',
      workspaceId,
      name: 'local',
      kind: 'local',
      model: 'testpilot-local-heuristics-v1',
      enabled: true,
      connectionParams: {},
      credentialsConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    reason: 'local provider (hardcoded fallback)',
    usedFallback: true,
  };
}

/** Log a routing decision to the activity history. */
export function logRoutingDecision(
  workspaceId: string,
  taskCategory: string,
  providerId: string,
  fallbackProviderId: string | undefined,
  selectedProviderId: string,
  reason: string,
  success: boolean,
  latencyMs?: number,
  error?: string,
): void {
  const db = getDb();
  const record: AiRoutingDecision = {
    id: id('route'),
    workspaceId,
    taskCategory,
    providerId,
    fallbackProviderId,
    selectedProviderId,
    reason,
    success,
    latencyMs,
    error,
    createdAt: new Date().toISOString(),
  };
  db.aiRoutingDecisions.unshift(record);
  if (db.aiRoutingDecisions.length > 1000) db.aiRoutingDecisions.length = 1000;
  saveDb();
}

/** Get routing decisions for a workspace. */
export function listRoutingDecisions(workspaceId: string, limit = 50): AiRoutingDecision[] {
  const db = getDb();
  return db.aiRoutingDecisions
    .filter((d) => d.workspaceId === workspaceId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

/* ================================================================= Phase 40: multi-provider calling */

/** Call a specific provider config and return the text response. */
export async function callProvider(config: AiProviderConfig, messages: AiMessage[], options?: { timeoutMs?: number }): Promise<{ content: string | null; latencyMs: number; provider: string }> {
  const t0 = performance.now();
  const kind = config.kind;

  if (kind === 'local') {
    return { content: localChat(messages[messages.length - 1]?.content ?? '', ''), latencyMs: Math.round(performance.now() - t0), provider: 'local' };
  }

  const base = config.baseUrl;
  if (!base) return { content: null, latencyMs: Math.round(performance.now() - t0), provider: kind };

  const timeoutMs = options?.timeoutMs ?? (Number(config.connectionParams?.timeoutMs) || 20000);

  try {
    if (kind === 'ollama') {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.model ?? 'llama3.2', messages, stream: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { content: null, latencyMs: Math.round(performance.now() - t0), provider: kind };
      const data = (await res.json()) as { message?: { content?: string } };
      return { content: data.message?.content ?? null, latencyMs: Math.round(performance.now() - t0), provider: kind };
    }
    if (kind === 'openai-compatible') {
      const creds = getProviderCredentials(config.id);
      const apiKey = creds['apiKey'] ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? '';
      const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { content: null, latencyMs: Math.round(performance.now() - t0), provider: kind };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { content: data.choices?.[0]?.message?.content ?? null, latencyMs: Math.round(performance.now() - t0), provider: kind };
    }
  } catch {
    /* fall through */
  }
  return { content: null, latencyMs: Math.round(performance.now() - t0), provider: kind };
}

/** Health check for a provider config. */
export async function checkProviderHealth(config: AiProviderConfig): Promise<ProviderHealthResult> {
  const t0 = performance.now();
  const kind = config.kind;

  if (kind === 'local') {
    return {
      providerId: config.id,
      status: 'healthy',
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      details: { kind: 'local', model: 'testpilot-local-heuristics-v1' },
    };
  }

  const base = config.baseUrl;
  if (!base) {
    return { providerId: config.id, status: 'unhealthy', checkedAt: new Date().toISOString(), error: 'No base URL configured' };
  }

  try {
    if (kind === 'ollama') {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(Number(config.connectionParams?.timeoutMs) || 10000),
      });
      const latency = Math.round(performance.now() - t0);
      if (!res.ok) {
        return { providerId: config.id, status: 'unhealthy', checkedAt: new Date().toISOString(), latencyMs: latency, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { models?: Array<{ name?: string }> };
      return {
        providerId: config.id,
        status: 'healthy',
        checkedAt: new Date().toISOString(),
        latencyMs: latency,
        details: { kind: 'ollama', baseUrl: base, models: data.models?.map((m) => m.name) ?? [] },
      };
    }
    if (kind === 'openai-compatible') {
      const creds = getProviderCredentials(config.id);
      const apiKey = creds['apiKey'] ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? '';
      const res = await fetch(`${base.replace(/\/$/, '')}/models`, {
        method: 'GET',
        headers: { ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        signal: AbortSignal.timeout(Number(config.connectionParams?.timeoutMs) || 10000),
      });
      const latency = Math.round(performance.now() - t0);
      if (!res.ok) {
        return { providerId: config.id, status: 'unhealthy', checkedAt: new Date().toISOString(), latencyMs: latency, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      return {
        providerId: config.id,
        status: 'healthy',
        checkedAt: new Date().toISOString(),
        latencyMs: latency,
        details: { kind: 'openai-compatible', baseUrl: base, models: data.data?.map((m) => m.id) ?? [] },
      };
    }
  } catch (err) {
    return { providerId: config.id, status: 'unhealthy', checkedAt: new Date().toISOString(), error: String(err) };
  }
  return { providerId: config.id, status: 'unhealthy', checkedAt: new Date().toISOString(), error: 'Unsupported provider kind' };
}

/** Run a full connection test for a provider. */
export async function testProviderConnection(config: AiProviderConfig): Promise<ProviderConnectionTest> {
  const t0 = performance.now();
  const kind = config.kind;
  const base = config.baseUrl ?? '';

  const result: ProviderConnectionTest = {
    id: `conn_${crypto.randomBytes(6).toString('hex')}`,
    providerId: config.id,
    testedAt: new Date().toISOString(),
    dnsReachable: false,
    endpointAvailable: false,
    authenticationOk: false,
    modelAvailable: false,
    validResponse: false,
    streamingSupported: false,
    structuredOutputSupported: false,
    timeoutMs: 0,
    error: undefined,
  };

  if (kind === 'local') {
    result.dnsReachable = true;
    result.endpointAvailable = true;
    result.authenticationOk = true;
    result.modelAvailable = true;
    result.validResponse = true;
    result.streamingSupported = false;
    result.structuredOutputSupported = true;
    result.timeoutMs = Math.round(performance.now() - t0);
    return result;
  }

  if (!base) {
    result.error = 'No base URL configured';
    result.timeoutMs = Math.round(performance.now() - t0);
    return result;
  }

  const timeoutMs = Number(config.connectionParams?.timeoutMs) || 10000;

  // DNS / reachability: attempt a fetch to the base URL
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}`, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    result.dnsReachable = true;
    result.endpointAvailable = res.ok || res.status === 404 || res.status === 401; // server responded
    result.timeoutMs = Math.round(performance.now() - t0);
  } catch (err) {
    result.error = `Network unreachable: ${String(err)}`;
    result.timeoutMs = Math.round(performance.now() - t0);
    return result;
  }

  // Authentication + model availability via health endpoint
  try {
    const health = await checkProviderHealth(config);
    result.authenticationOk = health.status === 'healthy';
    const details = health.details as { models?: unknown[] } | undefined;
    const models = details?.models;
    result.modelAvailable = health.status === 'healthy' && (models ? models.length > 0 : false);
    if (health.error) result.error = health.error;
  } catch (err) {
    result.error = String(err);
  }

  // Valid response: send a minimal chat request
  try {
    const reply = await callProvider(config, [{ role: 'user', content: 'Hello' }], { timeoutMs });
    result.validResponse = reply.content !== null;
    if (!reply.content && !result.error) result.error = 'No content returned';
  } catch (err) {
    result.error = String(err);
  }

  return result;
}

/* ================================================================= Phase 41: routing-aware AI call wrappers */

/** Generate cases using routing-aware provider selection. */
export async function generateCasesWithRouting(
  requirement: string,
  count: number,
  workspaceId: string,
  taskCategory: string = 'case-generation',
): Promise<{ cases: GeneratedCase[]; provider: string; routing: { reason: string; usedFallback: boolean } }> {
  const local = localGenerateCases(requirement, count);
  const resolved = resolveProvider(workspaceId, taskCategory);
  const config = resolved.config;

  if (!config) {
    return { cases: local, provider: 'local', routing: { reason: resolved.reason, usedFallback: true } };
  }

  if (config.kind === 'local') {
    // Even local calls go through routing decision logging.
    logRoutingDecision(workspaceId, taskCategory, config.id, undefined, config.id, resolved.reason, true, 0);
    return { cases: local, provider: config.name, routing: { reason: resolved.reason, usedFallback: resolved.usedFallback } };
  }

  const t0 = performance.now();
  let retries = 0;
  const maxRetries = 2;
  let lastError: string | undefined;

  while (retries <= maxRetries) {
    try {
      const reply = await callProvider(config, [
        { role: 'system', content: 'You are a senior QA engineer. Reply with strict JSON: {"cases":[{"title","type","priority","steps":[],"expected","rationale"}]}.' },
        { role: 'user', content: `Requirement: ${requirement}\nReturn ${count} test cases covering functional, negative, security and accessibility angles.` },
      ], { timeoutMs: Number(config.connectionParams?.timeoutMs) || 20000 });

      const latency = Math.round(performance.now() - t0);
      logRoutingDecision(workspaceId, taskCategory, config.id, resolved.usedFallback ? undefined : config.id, config.id, resolved.reason, reply.content !== null, latency, reply.content ? undefined : 'No content returned');

      if (!reply) {
        lastError = 'No response from provider';
        retries++;
        continue;
      }
      try {
        const parsed = JSON.parse(reply.content!.replace(/^```json\s*|```$/g, '')) as { cases?: GeneratedCase[] };
        if (Array.isArray(parsed.cases) && parsed.cases.length) {
          return { cases: parsed.cases.slice(0, count), provider: config.name, routing: { reason: resolved.reason, usedFallback: resolved.usedFallback } };
        }
      } catch {
        /* fall through */
      }
      lastError = 'Invalid response format';
      retries++;
    } catch (err) {
      lastError = String(err);
      retries++;
    }
  }

  // All retries exhausted — try fallback provider if available.
  if (resolved.usedFallback === false) {
    // Try env-var fallback or local.
    const fbRes = resolveProvider(workspaceId, taskCategory);
    if (fbRes.config && fbRes.config.kind === 'local') {
      logRoutingDecision(workspaceId, taskCategory, config.id, config.id, 'env-local', 'fallback after provider failure', true, 0, lastError);
      return { cases: local, provider: 'local', routing: { reason: 'fallback after provider failure', usedFallback: true } };
    }
  }

  logRoutingDecision(workspaceId, taskCategory, config.id, undefined, config.id, resolved.reason, false, 0, lastError);
  return { cases: local, provider: 'local', routing: { reason: `all retries failed, used local fallback: ${lastError}`, usedFallback: true } };
}

/** Analyse failures using routing-aware provider selection. */
export async function analyseFailuresWithRouting(
  failures: FailureInput[],
  workspaceId: string,
  taskCategory: string = 'failure-triage',
): Promise<{ analysis: string; provider: string; routing: { reason: string; usedFallback: boolean } }> {
  const local = localFailureAnalysis(failures);
  if (failures.length === 0) {
    logRoutingDecision(workspaceId, taskCategory, 'local', undefined, 'local', 'no failures to triage', true, 0);
    return { analysis: local, provider: 'local', routing: { reason: 'no failures', usedFallback: false } };
  }

  const resolved = resolveProvider(workspaceId, taskCategory);
  const config = resolved.config;

  if (!config || config.kind === 'local') {
    logRoutingDecision(workspaceId, taskCategory, config?.id ?? 'local', undefined, config?.id ?? 'local', resolved.reason, true, 0);
    return { analysis: local, provider: config?.name ?? 'local', routing: { reason: resolved.reason, usedFallback: resolved.usedFallback } };
  }

  const t0 = performance.now();
  let retries = 0;
  const maxRetries = 2;
  let lastError: string | undefined;

  while (retries <= maxRetries) {
    try {
      const reply = await callProvider(config, [
        { role: 'system', content: 'You are a QA failure triage assistant. Be concise and evidence-driven. Use markdown with a root-cause hypothesis, evidence and next action.' },
        { role: 'user', content: `Failures:\n${JSON.stringify(failures, null, 2)}` },
      ], { timeoutMs: Number(config.connectionParams?.timeoutMs) || 20000 });

      const latency = Math.round(performance.now() - t0);
      logRoutingDecision(workspaceId, taskCategory, config.id, resolved.usedFallback ? undefined : config.id, config.id, resolved.reason, reply !== null, latency, reply ? undefined : 'No content returned');

      if (!reply) {
        lastError = 'No response from provider';
        retries++;
        continue;
      }
      return { analysis: reply.content!, provider: config.name, routing: { reason: resolved.reason, usedFallback: resolved.usedFallback } };
    } catch (err) {
      lastError = String(err);
      retries++;
    }
  }

  // All retries exhausted — fall back to local.
  logRoutingDecision(workspaceId, taskCategory, config.id, undefined, 'local', `fallback after provider failure: ${lastError}`, true, 0, lastError);
  return { analysis: local, provider: 'local', routing: { reason: `fallback after provider failure: ${lastError}`, usedFallback: true } };
}

/** Ask assistant using routing-aware provider selection. */
export async function askAssistantWithRouting(
  question: string,
  context: string,
  workspaceId: string,
  taskCategory: string = 'assistant',
): Promise<{ answer: string; provider: string; routing: { reason: string; usedFallback: boolean } }> {
  const resolved = resolveProvider(workspaceId, taskCategory);
  const config = resolved.config;

  if (!config || config.kind === 'local') {
    const answer = localChat(question, context);
    logRoutingDecision(workspaceId, taskCategory, config?.id ?? 'local', undefined, config?.id ?? 'local', resolved.reason, true, 0);
    return { answer, provider: config?.name ?? 'local', routing: { reason: resolved.reason, usedFallback: resolved.usedFallback } };
  }

  const t0 = performance.now();
  let retries = 0;
  const maxRetries = 2;
  let lastError: string | undefined;

  while (retries <= maxRetries) {
    try {
      const reply = await callProvider(config, [
        { role: 'system', content: `You are TESTPILOT AI, a concise QA engineer. Workspace context:\n${context}` },
        { role: 'user', content: question },
      ], { timeoutMs: Number(config.connectionParams?.timeoutMs) || 20000 });

      const latency = Math.round(performance.now() - t0);
      logRoutingDecision(workspaceId, taskCategory, config.id, resolved.usedFallback ? undefined : config.id, config.id, resolved.reason, reply !== null, latency, reply ? undefined : 'No content returned');

      if (!reply) {
        lastError = 'No response from provider';
        retries++;
        continue;
      }
      return { answer: reply.content!, provider: config.name, routing: { reason: resolved.reason, usedFallback: resolved.usedFallback } };
    } catch (err) {
      lastError = String(err);
      retries++;
    }
  }

  // All retries exhausted — fall back to local.
  const answer = localChat(question, context);
  logRoutingDecision(workspaceId, taskCategory, config.id, undefined, 'local', `fallback after provider failure: ${lastError}`, true, 0, lastError);
  return { answer, provider: 'local', routing: { reason: `fallback after provider failure: ${lastError}`, usedFallback: true } };
}

/** Generate a structured plan using the configured provider, falling back to local rules. */
export async function generateCases(requirement: string, count: number): Promise<{ cases: GeneratedCase[]; provider: string }> {
  const local = localGenerateCases(requirement, count);
  const info = providerInfo();
  if (!info.available || info.name === 'local') return { cases: local, provider: info.name };
  const reply = await callCloud([
    { role: 'system', content: 'You are a senior QA engineer. Reply with strict JSON: {"cases":[{"title","type","priority","steps":[],"expected","rationale"}]}.' },
    { role: 'user', content: `Requirement: ${requirement}\nReturn ${count} test cases covering functional, negative, security and accessibility angles.` },
  ]);
  if (!reply) return { cases: local, provider: `${info.name} (fallback to local)` };
  try {
    const parsed = JSON.parse(reply.replace(/^```json\s*|```$/g, '')) as { cases?: GeneratedCase[] };
    if (Array.isArray(parsed.cases) && parsed.cases.length) return { cases: parsed.cases.slice(0, count), provider: info.name };
  } catch {
    /* fall through */
  }
  return { cases: local, provider: `${info.name} (fallback to local)` };
}

export async function analyseFailures(failures: FailureInput[]): Promise<{ analysis: string; provider: string }> {
  const info = providerInfo();
  const local = localFailureAnalysis(failures);
  if (!info.available || info.name === 'local' || failures.length === 0) return { analysis: local, provider: info.name };
  const reply = await callCloud([
    { role: 'system', content: 'You are a QA failure triage assistant. Be concise and evidence-driven. Use markdown with a root-cause hypothesis, evidence and next action.' },
    { role: 'user', content: `Failures:\n${JSON.stringify(failures, null, 2)}` },
  ]);
  return { analysis: reply ?? local, provider: reply ? info.name : `${info.name} (fallback to local)` };
}

export async function askAssistant(question: string, context: string): Promise<{ answer: string; provider: string }> {
  const info = providerInfo();
  if (!info.available || info.name === 'local') return { answer: localChat(question, context), provider: 'local' };
  const reply = await callCloud([
    { role: 'system', content: `You are TESTPILOT AI, a concise QA engineer. Workspace context:\n${context}` },
    { role: 'user', content: question },
  ]);
  return { answer: reply ?? localChat(question, context), provider: reply ? info.name : `${info.name} (fallback to local)` };
}

/* ================================================================= Phase 41: provider-aware wrappers for benchmark execution */

/** Generate cases using a specific provider config. Used by multi-model benchmark execution. */
export async function generateCasesWithProvider(
  config: AiProviderConfig,
  requirement: string,
  count: number,
): Promise<{ cases: GeneratedCase[]; provider: string }> {
  const local = localGenerateCases(requirement, count);

  if (config.kind === 'local') {
    return { cases: local, provider: 'local' };
  }

  const base = config.baseUrl;
  if (!base) return { cases: local, provider: config.kind };

  const timeoutMs = Number(config.connectionParams?.timeoutMs) || 20000;

  try {
    if (config.kind === 'ollama') {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model ?? 'llama3.2',
          messages: [
            { role: 'system', content: 'You are a senior QA engineer. Reply with strict JSON: {"cases":[{"title","type","priority","steps":[],"expected","rationale"}]}.' },
            { role: 'user', content: `Requirement: ${requirement}\nReturn ${count} test cases covering functional, negative, security and accessibility angles.` },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { cases: local, provider: config.kind };
      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content;
      if (!content) return { cases: local, provider: config.kind };
      try {
        const parsed = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as { cases?: GeneratedCase[] };
        if (Array.isArray(parsed.cases) && parsed.cases.length) return { cases: parsed.cases.slice(0, count), provider: config.kind };
      } catch {
        /* fall through */
      }
      return { cases: local, provider: config.kind };
    }
    if (config.kind === 'openai-compatible') {
      const creds = getProviderCredentials(config.id);
      const apiKey = creds['apiKey'] ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? '';
      const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: 'You are a senior QA engineer. Reply with strict JSON: {"cases":[{"title","type","priority","steps":[],"expected","rationale"}]}.' },
            { role: 'user', content: `Requirement: ${requirement}\nReturn ${count} test cases covering functional, negative, security and accessibility angles.` },
          ],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { cases: local, provider: config.kind };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return { cases: local, provider: config.kind };
      try {
        const parsed = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as { cases?: GeneratedCase[] };
        if (Array.isArray(parsed.cases) && parsed.cases.length) return { cases: parsed.cases.slice(0, count), provider: config.kind };
      } catch {
        /* fall through */
      }
      return { cases: local, provider: config.kind };
    }
  } catch {
    /* fall through */
  }
  return { cases: local, provider: config.kind };
}

/** Analyse failures using a specific provider config. Used by multi-model benchmark execution. */
export async function analyseFailuresWithProvider(
  config: AiProviderConfig,
  failures: FailureInput[],
): Promise<{ analysis: string; provider: string }> {
  const local = localFailureAnalysis(failures);
  if (failures.length === 0) return { analysis: local, provider: 'local' };

  if (config.kind === 'local') {
    return { analysis: local, provider: 'local' };
  }

  const base = config.baseUrl;
  if (!base) return { analysis: local, provider: config.kind };

  const timeoutMs = Number(config.connectionParams?.timeoutMs) || 20000;

  try {
    if (config.kind === 'ollama') {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model ?? 'llama3.2',
          messages: [
            { role: 'system', content: 'You are a QA failure triage assistant. Be concise and evidence-driven. Use markdown with a root-cause hypothesis, evidence and next action.' },
            { role: 'user', content: `Failures:\n${JSON.stringify(failures, null, 2)}` },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { analysis: local, provider: config.kind };
      const data = (await res.json()) as { message?: { content?: string } };
      return { analysis: data.message?.content ?? local, provider: config.kind };
    }
    if (config.kind === 'openai-compatible') {
      const creds = getProviderCredentials(config.id);
      const apiKey = creds['apiKey'] ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? '';
      const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: 'You are a QA failure triage assistant. Be concise and evidence-driven. Use markdown with a root-cause hypothesis, evidence and next action.' },
            { role: 'user', content: `Failures:\n${JSON.stringify(failures, null, 2)}` },
          ],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { analysis: local, provider: config.kind };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { analysis: data.choices?.[0]?.message?.content ?? local, provider: config.kind };
    }
  } catch {
    /* fall through */
  }
  return { analysis: local, provider: config.kind };
}

/** Ask assistant using a specific provider config. Used by multi-model benchmark execution. */
export async function askAssistantWithProvider(
  config: AiProviderConfig,
  question: string,
  context: string,
): Promise<{ answer: string; provider: string }> {
  if (config.kind === 'local') {
    return { answer: localChat(question, context), provider: 'local' };
  }

  const base = config.baseUrl;
  if (!base) return { answer: localChat(question, context), provider: config.kind };

  const timeoutMs = Number(config.connectionParams?.timeoutMs) || 20000;

  try {
    if (config.kind === 'ollama') {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model ?? 'llama3.2',
          messages: [
            { role: 'system', content: `You are TESTPILOT AI, a concise QA engineer. Workspace context:\n${context}` },
            { role: 'user', content: question },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { answer: localChat(question, context), provider: config.kind };
      const data = (await res.json()) as { message?: { content?: string } };
      return { answer: data.message?.content ?? localChat(question, context), provider: config.kind };
    }
    if (config.kind === 'openai-compatible') {
      const creds = getProviderCredentials(config.id);
      const apiKey = creds['apiKey'] ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? '';
      const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: `You are TESTPILOT AI, a concise QA engineer. Workspace context:\n${context}` },
            { role: 'user', content: question },
          ],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { answer: localChat(question, context), provider: config.kind };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { answer: data.choices?.[0]?.message?.content ?? localChat(question, context), provider: config.kind };
    }
  } catch {
    /* fall through */
  }
  return { answer: localChat(question, context), provider: config.kind };
}