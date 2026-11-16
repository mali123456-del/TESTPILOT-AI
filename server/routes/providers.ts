/**
 * AI Provider Management routes (Phase 40).
 *
 * Endpoints:
 *   GET    /api/ai/providers              List provider configs (public view)
 *   POST   /api/ai/providers              Create provider config (admin+)
 *   PATCH  /api/ai/providers/:id          Edit provider config (admin+)
 *   DELETE /api/ai/providers/:id          Remove provider config (admin+)
 *   POST   /api/ai/providers/:id/credentials  Set/update credentials (admin+)
 *   DELETE /api/ai/providers/:id/credentials  Remove credentials (admin+)
 *   POST   /api/ai/providers/:id/test     Test connection (tester+)
 *   GET    /api/ai/providers/:id/health   Health check (tester+)
 *
 *   GET    /api/ai/models                 Model registry (tester+)
 *   POST   /api/ai/models/discover        Discover models from provider (tester+)
 *   PATCH  /api/ai/models/:id             Update model registry entry (admin+)
 *
 *   POST   /api/ai/playground/chat        Multi-model playground chat (tester+)
 *   POST   /api/ai/playground/compare     Compare models with same prompt (tester+)
 *
 *   GET    /api/ai/routing                Routing config (tester+)
 *   PATCH  /api/ai/routing                Update routing config (admin+)
 *
 *   GET    /api/ai/activity               Provider activity history (tester+)
 */

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import type {
  AiProviderConfig,
  AiModel,
  ProviderActivity,
  AiPlaygroundSession,
} from '../../shared/types.js';
import type { AiMessage } from '../ai/provider.js';
import { getDb, id, now, saveDb, audit } from '../store.js';
import { requireAuth, requireRole, type AuthedRequest } from './core.js';
import {
  callProvider,
  checkProviderHealth,
  encryptCredential,
  getProviderConfig,
  getProviderConfigPublic,
  listProviderConfigs,
  markCredentialsConfigured,
  testProviderConnection,
  upsertProviderConfig,
  deleteProviderConfig,
  setProviderCredentials,
  clearProviderCredentials,
  providerInfo,
} from '../ai/provider.js';

export const providersRouter = Router();

/* ----------------------------------------------------------------- helpers */

function activity(
  req: AuthedRequest,
  action: string,
  target?: string,
  success?: boolean,
  meta?: Record<string, unknown>,
  latencyMs?: number,
): void {
  const db = getDb();
  const record: ProviderActivity = {
    id: id('act'),
    workspaceId: req.user!.workspaceId,
    providerId: meta?.providerId as string | undefined,
    action,
    target,
    success: success ?? false,
    latencyMs,
    error: meta?.error as string | undefined,
    createdAt: now(),
  };
  db.providerActivities.unshift(record);
  if (db.providerActivities.length > 1000) db.providerActivities.length = 1000;
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, action, target, { ...meta, success, latencyMs }, req.ip);
}

/* ----------------------------------------------------------- providers list */

providersRouter.get('/providers', requireAuth, (req: AuthedRequest, res) => {
  const configs = listProviderConfigs(req.user!.workspaceId);
  // Include env-var provider as a read-only entry when no DB config exists for it
  const envInfo = providerInfo();
  res.json({ providers: configs, envProvider: envInfo });
});

/* ----------------------------------------------------------- create provider */

const providerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(['local', 'ollama', 'openai-compatible']),
  baseUrl: z.string().url().optional().or(z.literal('')),
  model: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  connectionParams: z.record(z.string()).optional(),
  credentials: z.record(z.string()).optional(),
});

providersRouter.post('/providers', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = providerCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid provider configuration' });

  const data = parsed.data;
  const workspaceId = req.user!.workspaceId;

  // Validate kind-specific requirements
  if (data.kind !== 'local' && !data.baseUrl) {
    return res.status(400).json({ error: `${data.kind} requires a base URL` });
  }

  const config: Omit<AiProviderConfig, 'id' | 'createdAt' | 'updatedAt'> = {
    workspaceId,
    name: data.name,
    kind: data.kind,
    baseUrl: data.baseUrl || undefined,
    model: data.model,
    enabled: data.enabled ?? true,
    connectionParams: data.connectionParams,
    credentialsConfigured: false,
  };

  const created = upsertProviderConfig({ ...config, createdBy: req.user!.name });

  // Store credentials if provided
  if (data.credentials && Object.keys(data.credentials).length > 0) {
    const encrypted: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.credentials)) {
      const enc = encryptCredential(v);
      encrypted[k] = enc ?? v;
    }
    setProviderCredentials(created.id, encrypted);
    markCredentialsConfigured(created.id, true);
  }

  activity(req, 'provider.created', created.id, true, { providerId: created.id, kind: data.kind });
  res.status(201).json({ provider: getProviderConfigPublic(created.id)!, credentialsConfigured: !!data.credentials });
});

/* ----------------------------------------------------------- edit provider */

const providerPatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional().or(z.literal('')).optional(),
  model: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  connectionParams: z.record(z.string()).optional(),
});

providersRouter.patch('/providers/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = providerPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid provider update' });

  const existing = getProviderConfig(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Provider not found' });
  if (existing.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const data = parsed.data;
  upsertProviderConfig({
    id: existing.id,
    workspaceId: existing.workspaceId,
    name: data.name ?? existing.name,
    kind: existing.kind,
    baseUrl: data.baseUrl !== undefined ? (data.baseUrl || undefined) : existing.baseUrl,
    model: data.model ?? existing.model,
    enabled: data.enabled ?? existing.enabled,
    connectionParams: data.connectionParams ?? existing.connectionParams,
    credentialsConfigured: existing.credentialsConfigured,
    createdBy: existing.createdBy,
  });

  activity(req, 'provider.updated', existing.id, true, { providerId: existing.id });
  res.json({ provider: getProviderConfigPublic(existing.id)! });
});

/* ----------------------------------------------------------- delete provider */

providersRouter.delete('/providers/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const existing = getProviderConfig(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Provider not found' });
  if (existing.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const ok = deleteProviderConfig(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Provider not found' });

  activity(req, 'provider.deleted', req.params.id, true, { providerId: req.params.id });
  res.json({ ok: true });
});

/* ----------------------------------------------------------- credentials */

const credentialsSchema = z.object({
  credentials: z.record(z.string()),
});

providersRouter.post('/providers/:id/credentials', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials' });

  const existing = getProviderConfig(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Provider not found' });
  if (existing.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const encrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data.credentials)) {
    const enc = encryptCredential(v);
    encrypted[k] = enc ?? v;
  }
  setProviderCredentials(existing.id, encrypted);
  markCredentialsConfigured(existing.id, true);

  activity(req, 'provider.credentials_set', existing.id, true, { providerId: existing.id });
  res.json({ credentialsConfigured: true, masked: Object.fromEntries(Object.keys(parsed.data.credentials).map((k) => [k, '***'])) });
});

providersRouter.delete('/providers/:id/credentials', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const existing = getProviderConfig(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Provider not found' });
  if (existing.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  clearProviderCredentials(existing.id);
  markCredentialsConfigured(existing.id, false);

  activity(req, 'provider.credentials_removed', existing.id, true, { providerId: existing.id });
  res.json({ credentialsConfigured: false });
});

/* ----------------------------------------------------------- connection test */

providersRouter.post('/providers/:id/test', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const config = getProviderConfig(req.params.id);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  if (config.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const result = await testProviderConnection(config);
  activity(req, 'connection.test', req.params.id, !result.error, {
    providerId: config.id,
    error: result.error,
    latencyMs: result.timeoutMs,
  }, result.timeoutMs);
  res.json(result);
});

/* ----------------------------------------------------------- health check */

providersRouter.get('/providers/:id/health', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const config = getProviderConfig(req.params.id);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  if (config.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const result = await checkProviderHealth(config);
  activity(req, 'health.check', req.params.id, result.status === 'healthy', {
    providerId: config.id,
    error: result.error,
    latencyMs: result.latencyMs,
  }, result.latencyMs);
  res.json(result);
});

/* ----------------------------------------------------------- model registry */

const modelSchema = z.object({
  providerId: z.string(),
  name: z.string().min(1).max(100),
  identifier: z.string().min(1).max(100),
  type: z.enum(['chat', 'completion', 'embedding']),
  version: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  capabilities: z.array(z.string()).optional(),
  inputFormats: z.array(z.string()).optional(),
  outputFormats: z.array(z.string()).optional(),
  toolCalling: z.boolean().optional(),
  streaming: z.boolean().optional(),
  enabled: z.boolean().optional(),
  benchmarkEligible: z.boolean().optional(),
});

providersRouter.get('/models', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const models = db.aiModels.filter((m) => m.workspaceId === req.user!.workspaceId);
  res.json({ models });
});

providersRouter.post('/models', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = modelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid model entry' });

  const data = parsed.data;
  const provider = getProviderConfig(data.providerId);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  if (provider.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const db = getDb();
  const model: AiModel = {
    id: `model_${crypto.randomBytes(6).toString('hex')}`,
    workspaceId: req.user!.workspaceId,
    providerId: data.providerId,
    name: data.name,
    identifier: data.identifier,
    type: data.type,
    version: data.version,
    contextWindow: data.contextWindow,
    capabilities: data.capabilities ?? [],
    inputFormats: data.inputFormats ?? ['text'],
    outputFormats: data.outputFormats ?? ['text'],
    toolCalling: data.toolCalling ?? false,
    streaming: data.streaming ?? false,
    enabled: data.enabled ?? true,
    benchmarkEligible: data.benchmarkEligible ?? false,
    createdAt: now(),
    updatedAt: now(),
  };
  db.aiModels.push(model);
  saveDb();

  activity(req, 'model.registered', model.id, true, { providerId: data.providerId });
  res.status(201).json({ model });
});

providersRouter.patch('/models/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = modelSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid model update' });

  const db = getDb();
  const model = db.aiModels.find((m) => m.id === req.params.id && m.workspaceId === req.user!.workspaceId);
  if (!model) return res.status(404).json({ error: 'Model not found' });

  const data = parsed.data;
  Object.assign(model, {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.identifier !== undefined && { identifier: data.identifier }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.version !== undefined && { version: data.version }),
    ...(data.contextWindow !== undefined && { contextWindow: data.contextWindow }),
    ...(data.capabilities !== undefined && { capabilities: data.capabilities }),
    ...(data.inputFormats !== undefined && { inputFormats: data.inputFormats }),
    ...(data.outputFormats !== undefined && { outputFormats: data.outputFormats }),
    ...(data.toolCalling !== undefined && { toolCalling: data.toolCalling }),
    ...(data.streaming !== undefined && { streaming: data.streaming }),
    ...(data.enabled !== undefined && { enabled: data.enabled }),
    ...(data.benchmarkEligible !== undefined && { benchmarkEligible: data.benchmarkEligible }),
    updatedAt: now(),
  });
  saveDb();

  activity(req, 'model.updated', model.id, true, { providerId: model.providerId });
  res.json({ model });
});

/* ----------------------------------------------------------- model discovery */

providersRouter.post('/models/discover', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = z.object({ providerId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'providerId is required' });

  const config = getProviderConfig(parsed.data.providerId);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  if (config.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const health = await checkProviderHealth(config);
  const discovered: Array<Pick<AiModel, 'identifier' | 'type' | 'version' | 'contextWindow' | 'capabilities' | 'inputFormats' | 'outputFormats' | 'toolCalling' | 'streaming'>> = [];

  if (health.status === 'healthy' && health.details?.models) {
    for (const m of health.details.models as string[]) {
      discovered.push({
        identifier: m,
        type: 'chat',
        capabilities: ['text-generation'],
        inputFormats: ['text'],
        outputFormats: ['text'],
        toolCalling: false,
        streaming: false,
      });
    }
  }

  res.json({ discovered, providerId: config.id, providerKind: config.kind, health });
  activity(req, 'model.discovered', config.id, health.status === 'healthy', {
    providerId: config.id,
    count: discovered.length,
  });
});

/* ----------------------------------------------------------- playground */

const playgroundChatSchema = z.object({
  providerId: z.string(),
  model: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  systemPrompt: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
});

providersRouter.post('/playground/chat', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const parsed = playgroundChatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid playground request' });

  const config = getProviderConfig(parsed.data.providerId);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  if (config.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });

  const messages: AiMessage[] = [];
  if (parsed.data.systemPrompt) messages.push({ role: 'system', content: parsed.data.systemPrompt });
  messages.push({ role: 'user', content: parsed.data.prompt });

  const t0 = performance.now();
  const result = await callProvider(config, messages, { timeoutMs: parsed.data.timeoutMs });
  const latency = Math.round(performance.now() - t0);

  activity(req, 'playground.chat', config.id, result.content !== null, {
    providerId: config.id,
    model: parsed.data.model,
    latencyMs: latency,
    error: result.content ? undefined : 'No content returned',
  }, latency);

  res.json({
    providerId: config.id,
    providerKind: config.kind,
    model: parsed.data.model,
    prompt: parsed.data.prompt,
    response: result.content,
    latencyMs: latency,
    error: result.content ? undefined : 'No response from provider',
  });
});

const playgroundCompareSchema = z.object({
  providerIds: z.array(z.string()).min(1).max(5),
  model: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  systemPrompt: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
});

providersRouter.post('/playground/compare', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const parsed = playgroundCompareSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid comparison request' });

  const results: Array<{
    providerId: string;
    providerKind: string;
    model: string;
    response: string | null;
    latencyMs: number;
    error?: string;
  }> = [];

  for (const pid of parsed.data.providerIds) {
    const config = getProviderConfig(pid);
    if (!config || config.workspaceId !== req.user!.workspaceId) continue;

    const messages: AiMessage[] = [];
    if (parsed.data.systemPrompt) messages.push({ role: 'system', content: parsed.data.systemPrompt });
    messages.push({ role: 'user', content: parsed.data.prompt });

    const t0 = performance.now();
    const result = await callProvider(config, messages, { timeoutMs: parsed.data.timeoutMs });
    const latency = Math.round(performance.now() - t0);

    results.push({
      providerId: config.id,
      providerKind: config.kind,
      model: parsed.data.model,
      response: result.content,
      latencyMs: latency,
      ...(result.content ? {} : { error: 'No response' }),
    });

    activity(req, 'playground.compare', config.id, result.content !== null, {
      providerId: config.id,
      model: parsed.data.model,
      latencyMs: latency,
    }, latency);
  }

  res.json({ prompt: parsed.data.prompt, results });
});

/* ----------------------------------------------------------- routing */

providersRouter.get('/routing', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  let config = db.aiRoutingConfig.find((c) => c.workspaceId === req.user!.workspaceId);
  if (!config) {
    config = {
      id: `route_${crypto.randomBytes(6).toString('hex')}`,
      workspaceId: req.user!.workspaceId,
      defaultProviderId: null,
      rules: [],
      timeoutMs: 30000,
      maxRetries: 2,
      createdAt: now(),
      updatedAt: now(),
    };
    db.aiRoutingConfig.push(config);
    saveDb();
  }
  res.json({ config });
});

/* ---------------------------------------------------- routing decisions */

providersRouter.get('/routing/decisions', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize ?? 20) || 20));
  const all = db.aiRoutingDecisions.filter((d) => d.workspaceId === req.user!.workspaceId);
  const total = all.length;
  const items = all.slice((page - 1) * pageSize, page * pageSize);
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

/* ---------------------------------------------------- routing configuration */

const routingPatchSchema = z.object({
  defaultProviderId: z.string().nullable().optional(),
  timeoutMs: z.number().int().positive().max(300000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  rules: z.array(
    z.object({
      id: z.string().optional(),
      taskCategory: z.string().min(1),
      providerId: z.string(),
      fallbackProviderId: z.string().nullable().optional(),
      enabled: z.boolean().optional(),
    }),
  ).optional(),
});

providersRouter.patch('/routing', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = routingPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid routing config' });

  const db = getDb();
  let config = db.aiRoutingConfig.find((c) => c.workspaceId === req.user!.workspaceId);
  if (!config) {
    config = {
      id: `route_${crypto.randomBytes(6).toString('hex')}`,
      workspaceId: req.user!.workspaceId,
      defaultProviderId: null,
      rules: [],
      timeoutMs: 30000,
      maxRetries: 2,
      createdAt: now(),
      updatedAt: now(),
    };
    db.aiRoutingConfig.push(config);
  }

  const data = parsed.data;
  if (data.defaultProviderId !== undefined) config.defaultProviderId = data.defaultProviderId;
  if (data.timeoutMs !== undefined) config.timeoutMs = data.timeoutMs;
  if (data.maxRetries !== undefined) config.maxRetries = data.maxRetries;
  if (data.rules !== undefined) {
    config.rules = data.rules.map((r) => ({
      id: r.id ?? `rule_${crypto.randomBytes(6).toString('hex')}`,
      workspaceId: req.user!.workspaceId,
      taskCategory: r.taskCategory,
      providerId: r.providerId,
      fallbackProviderId: r.fallbackProviderId ?? undefined,
      enabled: r.enabled ?? true,
      createdAt: now(),
    }));
  }
  config.updatedAt = now();
  saveDb();

  activity(req, 'routing.updated', undefined, true, { providerId: data.defaultProviderId });
  res.json({ config });
});

/* ----------------------------------------------------------- activity history */

providersRouter.get('/activity', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize ?? 20) || 20));
  const all = db.providerActivities.filter((a) => a.workspaceId === req.user!.workspaceId);
  const total = all.length;
  const items = all.slice((page - 1) * pageSize, page * pageSize);
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

/* ---------------------------------------------------- playground sessions */

providersRouter.post('/playground/sessions', requireAuth, (req: AuthedRequest, res) => {
  const parsed = z
    .object({ name: z.string().min(1).max(100), prompt: z.string().min(1).max(5000), systemPrompt: z.string().max(2000).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid session data' });

  const session: AiPlaygroundSession = {
    id: id('session'),
    workspaceId: req.user!.workspaceId,
    name: parsed.data.name,
    prompt: parsed.data.prompt,
    systemPrompt: parsed.data.systemPrompt,
    createdAt: now(),
    updatedAt: now(),
  };

  const db = getDb();
  db.aiPlaygroundSessions.unshift(session);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'playground.session.create', session.id, { name: session.name, promptLength: session.prompt.length }, req.ip);
  res.status(201).json(session);
});

providersRouter.get('/playground/sessions', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize ?? 20) || 20));
  const all = db.aiPlaygroundSessions.filter((s) => s.workspaceId === req.user!.workspaceId);
  const total = all.length;
  const items = all.slice((page - 1) * pageSize, page * pageSize);
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

providersRouter.patch('/playground/sessions/:id', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const session = db.aiPlaygroundSessions.find((s) => s.id === req.params.id && s.workspaceId === req.user!.workspaceId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const parsed = z.object({ name: z.string().min(1).max(100), systemPrompt: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update data' });

  session.name = parsed.data.name;
  if (parsed.data.systemPrompt !== undefined) session.systemPrompt = parsed.data.systemPrompt;
  session.updatedAt = now();
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'playground.session.update', session.id, { name: session.name }, req.ip);
  res.json(session);
});

providersRouter.delete('/playground/sessions/:id', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const sessionIdx = db.aiPlaygroundSessions.findIndex((s) => s.id === req.params.id && s.workspaceId === req.user!.workspaceId);
  if (sessionIdx < 0) return res.status(404).json({ error: 'Session not found' });

  const session = db.aiPlaygroundSessions[sessionIdx];
  // Remove associated responses
  db.aiPlaygroundResponses = db.aiPlaygroundResponses.filter((r) => r.sessionId !== session.id);
  db.aiPlaygroundSessions.splice(sessionIdx, 1);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'playground.session.delete', session.id, { name: session.name }, req.ip);
  res.status(204).send();
});

providersRouter.get('/playground/sessions/:id/responses', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const session = db.aiPlaygroundSessions.find((s) => s.id === req.params.id && s.workspaceId === req.user!.workspaceId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const responses = db.aiPlaygroundResponses
    .filter((r) => r.sessionId === session.id)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  res.json({ responses, session });
});

/* ---------------------------------------------------- playground exports */

providersRouter.get('/playground/export/:sessionId', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const session = db.aiPlaygroundSessions.find((s) => s.id === req.params.sessionId && s.workspaceId === req.user!.workspaceId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const responses = db.aiPlaygroundResponses.filter((r) => r.sessionId === session.id);
  const exportData = {
    session,
    responses,
    exportedAt: now(),
    format: 'json',
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="playground-${session.id}.json"`);
  res.json(exportData);
});

providersRouter.get('/playground/export/comparison/:sessionId', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const session = db.aiPlaygroundSessions.find((s) => s.id === req.params.sessionId && s.workspaceId === req.user!.workspaceId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const responses = db.aiPlaygroundResponses.filter((r) => r.sessionId === session.id);
  
  // CSV format for comparison
  const csvHeaders = ['Provider', 'Model', 'Latency (ms)', 'Response', 'Error'];
  const csvRows = [
    csvHeaders.join(','),
    ...responses.map((r) => [
      r.providerKind,
      r.model,
      r.latencyMs.toString(),
      `"${(r.response || '').replace(/"/g, '""')}"`,
      r.error ? `"${r.error.replace(/"/g, '""')}"` : '',
    ].join(','))
  ];
  
  const csvContent = csvRows.join('\\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="playground-comparison-${session.id}.csv"`);
  res.send(csvContent);
});
