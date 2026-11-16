import { Router } from 'express';
import { z } from 'zod';
import type { BenchmarkLeaderboardEntry, BenchmarkRun, BenchmarkTarget } from '../../shared/types.js';
import { getDb, id, now, saveDb, audit } from '../store.js';
import { requireAuth, requireRole, type AuthedRequest } from './core.js';
import {
  BENCHMARK_SUITES,
  configHash,
  currentTarget,
  runAllSuites,
  runAllSuitesWithProvider,
} from '../ai/benchmarks.js';
import {
  getProviderConfig,
  listProviderConfigs,
} from '../ai/provider.js';

export const benchmarksRouter = Router();

/* ------------------------------------------------------------------ suites */

benchmarksRouter.get('/suites', requireAuth, (_req, res) => {
  res.json(
    BENCHMARK_SUITES.map((s) => ({
      id: s.id,
      name: s.name,
      capability: s.capability,
      description: s.description,
      measures: s.measures,
    })),
  );
});

/* -------------------------------------------------------------------- runs */

benchmarksRouter.post('/run', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ label: z.string().max(80).optional(), suiteIds: z.array(z.string().max(60)).max(20).optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid benchmark payload' });

  const target = currentTarget();
  if (!target.available) {
    return res.status(409).json({
      error: `Provider ${target.kind} is selected but not configured. Fix the environment configuration or switch AI_PROVIDER back to local.`,
      target,
    });
  }

  const unknown = (parsed.data.suiteIds ?? []).filter((sid) => !BENCHMARK_SUITES.some((s) => s.id === sid));
  if (unknown.length) return res.status(400).json({ error: `Unknown suite(s): ${unknown.join(', ')}` });

  const workspaceId = req.user!.workspaceId;
  const startedAt = now();
  const record: BenchmarkRun = {
    id: id('bench'),
    workspaceId,
    label: parsed.data.label,
    target,
    status: 'running',
    startedAt,
    configHash: configHash(target),
    suites: [],
    overall: { passRate: 0, accuracy: 0, consistency: 0, errorRate: 0, malformedJsonRate: 0, hallucinationRate: 0, avgLatencyMs: 0 },
    resource: {},
    notes: [],
  };

  try {
    const result = await runAllSuites(target, parsed.data.suiteIds);
    Object.assign(record, {
      status: 'completed',
      finishedAt: now(),
      durationMs: Math.round(result.suites.length ? result.suites.reduce((a, s) => a + s.latency.avgMs, 0) : 0),
      suites: result.suites,
      overall: result.overall,
      resource: result.resource,
      notes: result.notes,
    });
  } catch (err) {
    record.status = 'failed';
    record.finishedAt = now();
    record.notes = [`benchmark runner threw: ${String(err)}`];
  }
  record.durationMs = Math.max(0, Date.parse(record.finishedAt ?? startedAt) - Date.parse(startedAt));

  // History is append-only: existing benchmark records are never mutated.
  const db = getDb();
  db.benchmarks.unshift(record);
  // Bound storage: keep at most 100 runs per workspace (oldest beyond that are dropped).
  const wsRuns = db.benchmarks.filter((b) => b.workspaceId === workspaceId);
  if (wsRuns.length > 100) {
    const toKeep = new Set(wsRuns.slice(0, 100).map((b) => b.id));
    db.benchmarks = db.benchmarks.filter((b) => b.workspaceId !== workspaceId || toKeep.has(b.id));
  }
  saveDb();
  audit(workspaceId, req.user!.name, 'benchmark.run', record.id, { target: target.kind, status: record.status, passRate: record.overall.passRate }, req.ip);
  res.status(201).json(record);
});

/* ---------------------------------------------------- benchmark targets */

benchmarksRouter.get('/targets', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const providers = listProviderConfigs(req.user!.workspaceId);
  const models = db.aiModels.filter((m) => m.workspaceId === req.user!.workspaceId && m.benchmarkEligible && m.enabled);

  // Build targets: each eligible model + its provider config
  const targets: Array<{
    modelId: string;
    providerId: string;
    providerKind: string;
    modelName: string;
    modelIdentifier: string;
    configHash?: string;
  }> = [];

  for (const model of models) {
    const provider = providers.find((p) => p.id === model.providerId);
    if (!provider || !provider.enabled) continue;
    targets.push({
      modelId: model.id,
      providerId: provider.id,
      providerKind: provider.kind,
      modelName: model.name,
      modelIdentifier: model.identifier,
      configHash: configHash({ kind: provider.kind, model: model.identifier, available: true }),
    });
  }

  res.json({ targets });
});

/* ---------------------------------------------------- run against specific provider */

benchmarksRouter.post('/run/:providerId', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ label: z.string().max(80).optional(), suiteIds: z.array(z.string().max(60)).max(20).optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid benchmark payload' });

  const config = getProviderConfig(req.params.providerId);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  if (config.workspaceId !== req.user!.workspaceId) return res.status(403).json({ error: 'Forbidden' });
  if (!config.enabled) return res.status(409).json({ error: `Provider ${config.name} is disabled` });

  const workspaceId = req.user!.workspaceId;
  const startedAt = now();

  // Build a benchmark target from the provider config
  const target: BenchmarkTarget = {
    kind: config.kind,
    model: config.model ?? null,
    available: config.enabled && config.kind === 'local' || Boolean(config.baseUrl),
  };

  const record: BenchmarkRun = {
    id: id('bench'),
    workspaceId,
    label: parsed.data.label,
    target,
    status: 'running',
    startedAt,
    configHash: configHash(target),
    suites: [],
    overall: { passRate: 0, accuracy: 0, consistency: 0, errorRate: 0, malformedJsonRate: 0, hallucinationRate: 0, avgLatencyMs: 0 },
    resource: {},
    notes: [],
  };

  try {
    const result = await runAllSuitesWithProvider(target, config, parsed.data.suiteIds);
    Object.assign(record, {
      status: 'completed',
      finishedAt: now(),
      durationMs: Math.round(result.suites.length ? result.suites.reduce((a, s) => a + s.latency.avgMs, 0) : 0),
      suites: result.suites,
      overall: result.overall,
      resource: result.resource,
      notes: result.notes,
    });
  } catch (err) {
    record.status = 'failed';
    record.finishedAt = now();
    record.notes = [`benchmark runner threw: ${String(err)}`];
  }
  record.durationMs = Math.max(0, Date.parse(record.finishedAt ?? startedAt) - Date.parse(startedAt));

  const db = getDb();
  db.benchmarks.unshift(record);
  const wsRuns = db.benchmarks.filter((b) => b.workspaceId === workspaceId);
  if (wsRuns.length > 100) {
    const toKeep = new Set(wsRuns.slice(0, 100).map((b) => b.id));
    db.benchmarks = db.benchmarks.filter((b) => b.workspaceId !== workspaceId || toKeep.has(b.id));
  }
  saveDb();
  audit(workspaceId, req.user!.name, 'benchmark.run.provider', record.id, { target: target.kind, model: target.model, providerId: config.id, status: record.status, passRate: record.overall.passRate }, req.ip);
  res.status(201).json(record);
});

benchmarksRouter.get('/runs', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize ?? 20) || 20));
  const all = db.benchmarks.filter((b) => b.workspaceId === req.user!.workspaceId);
  const total = all.length;
  const items = all.slice((page - 1) * pageSize, page * pageSize).map((b) => ({
    ...b,
    suites: b.suites.map((s) => ({ suiteId: s.suiteId, name: s.name, metrics: s.metrics, latency: s.latency, errors: s.errors })),
  }));
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

benchmarksRouter.get('/runs/:id', requireAuth, (req: AuthedRequest, res) => {
  const run = getDb().benchmarks.find((b) => b.id === req.params.id && b.workspaceId === req.user!.workspaceId);
  if (!run) return res.status(404).json({ error: 'Benchmark run not found' });
  res.json(run);
});

benchmarksRouter.get('/runs/:id/export', requireAuth, (req: AuthedRequest, res) => {
  const run = getDb().benchmarks.find((b) => b.id === req.params.id && b.workspaceId === req.user!.workspaceId);
  if (!run) return res.status(404).json({ error: 'Benchmark run not found' });
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  if (format === 'json') {
    res.setHeader('content-disposition', `attachment; filename="${run.id}.json"`);
    return res.json(run);
  }
  const rows: string[] = ['run_id,started_at,target_kind,target_model,suite_id,metric,value,cases,errors,avg_latency_ms'];
  for (const s of run.suites) {
    const entries = Object.entries(s.metrics);
    if (!entries.length) rows.push([run.id, run.startedAt, run.target.kind, run.target.model ?? '', s.suiteId, 'no-metrics', '', s.cases.length, s.errors, s.latency.avgMs].join(','));
    for (const [key, value] of entries) {
      rows.push([run.id, run.startedAt, run.target.kind, run.target.model ?? '', s.suiteId, key, value, s.cases.length, s.errors, s.latency.avgMs].join(','));
    }
  }
  res.setHeader('content-disposition', `attachment; filename="${run.id}.csv"`);
  res.type('text/csv').send(rows.join('\n'));
});

/* --------------------------------------------------------------- leaderboard */

/**
 * Weighted score formula (documented in docs/AI_BENCHMARK_METHODOLOGY.md):
 *   quality      = passRate                            (weight 0.45)
 *   reliability  = consistency*0.5 + (100-errorRate)*0.3 + (100-malformedJsonRate)*0.2   (weight 0.20)
 *   robustness   = (100-hallucinationRate)*0.5 + injection-like resistance implied by passRate (weight 0.15)
 *   speed        = latency score: min(100, 50 * log10(1000 / max(avgLatencyMs, 1)) + 50) (weight 0.20)
 * Only completed runs count. An overall winner is declared only when at least
 * two distinct targets have completed runs in this workspace.
 */
function latencyScore(avgLatencyMs: number): number {
  const clamped = Math.max(avgLatencyMs, 1);
  return Math.min(100, Math.max(0, 50 * Math.log10(1000 / clamped) + 50));
}

benchmarksRouter.get('/leaderboard', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const completed = db.benchmarks.filter((b) => b.workspaceId === req.user!.workspaceId && b.status === 'completed');
  // Latest completed run per target (kind+model), newest first.
  const latest = new Map<string, BenchmarkRun>();
  for (const run of completed) {
    const key = `${run.target.kind}|${run.target.model ?? ''}`;
    const existing = latest.get(key);
    if (!existing || Date.parse(run.startedAt) > Date.parse(existing.startedAt)) latest.set(key, run);
  }
  const entries: BenchmarkLeaderboardEntry[] = [];
  for (const run of latest.values()) {
    const quality = run.overall.passRate;
    const reliability = run.overall.consistency * 0.5 + (100 - run.overall.errorRate) * 0.3 + (100 - run.overall.malformedJsonRate) * 0.2;
    const robustness = (100 - run.overall.hallucinationRate) * 0.8 + quality * 0.2;
    const speed = latencyScore(run.overall.avgLatencyMs);
    const score = quality * 0.45 + reliability * 0.2 + robustness * 0.15 + speed * 0.2;
    entries.push({
      target: run.target,
      runId: run.id,
      score: Math.round(score * 10) / 10,
      parts: {
        quality: Math.round(quality * 10) / 10,
        reliability: Math.round(reliability * 10) / 10,
        speed: Math.round(speed * 10) / 10,
        robustness: Math.round(robustness * 10) / 10,
      },
      passRate: run.overall.passRate,
      avgLatencyMs: run.overall.avgLatencyMs,
      evaluatedAt: run.finishedAt ?? run.startedAt,
    });
  }
  entries.sort((a, b) => b.score - a.score);
  res.json({
    entries,
    weights: { quality: 0.45, reliability: 0.2, robustness: 0.15, speed: 0.2 },
    formula: 'score = passRate*0.45 + (consistency*0.5 + (100-errorRate)*0.3 + (100-malformedJson)*0.2)*0.2 + ((100-hallucination)*0.8 + passRate*0.2)*0.15 + latencyScore*0.2',
    winnerDeclared: entries.length >= 2,
    note: entries.length >= 2 ? undefined : 'Only one target has completed runs in this workspace — no overall winner is declared until at least two distinct targets have been evaluated.',
  });
});

/* ----------------------------------------------------------------- compare */

benchmarksRouter.post('/compare', requireAuth, (req: AuthedRequest, res) => {
  const parsed = z.object({ a: z.string(), b: z.string() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Provide two benchmark run ids' });
  const db = getDb();
  const pick = (bid: string) => db.benchmarks.find((b) => b.id === bid && b.workspaceId === req.user!.workspaceId);
  const a = pick(parsed.data.a);
  const b = pick(parsed.data.b);
  if (!a || !b) return res.status(404).json({ error: 'Benchmark run not found' });
  if (a.configHash !== b.configHash) {
    return res.status(409).json({ error: 'Runs used different benchmark configurations; they are not directly comparable', aHash: a.configHash, bHash: b.configHash });
  }

  const suiteDelta = a.suites.map((sa) => {
    const sb = b.suites.find((s) => s.suiteId === sa.suiteId);
    const metrics: Record<string, { a: number; b: number; delta: number }> = {};
    for (const [key, value] of Object.entries(sa.metrics)) {
      const other = sb?.metrics[key];
      metrics[key] = { a: value, b: other ?? Number.NaN, delta: other === undefined ? Number.NaN : Math.round((other - value) * 10) / 10 };
    }
    return {
      suiteId: sa.suiteId,
      name: sa.name,
      latencyA: sa.latency.avgMs,
      latencyB: sb?.latency.avgMs ?? null,
      metrics,
    };
  });

  res.json({
    a: { id: a.id, startedAt: a.startedAt, target: a.target },
    b: { id: b.id, startedAt: b.startedAt, target: b.target },
    overall: {
      passRate: { a: a.overall.passRate, b: b.overall.passRate, delta: Math.round((b.overall.passRate - a.overall.passRate) * 10) / 10 },
      accuracy: { a: a.overall.accuracy, b: b.overall.accuracy, delta: Math.round((b.overall.accuracy - a.overall.accuracy) * 10) / 10 },
      consistency: { a: a.overall.consistency, b: b.overall.consistency, delta: Math.round((b.overall.consistency - a.overall.consistency) * 10) / 10 },
      errorRate: { a: a.overall.errorRate, b: b.overall.errorRate, delta: Math.round((b.overall.errorRate - a.overall.errorRate) * 10) / 10 },
      avgLatencyMs: { a: a.overall.avgLatencyMs, b: b.overall.avgLatencyMs, delta: Math.round((b.overall.avgLatencyMs - a.overall.avgLatencyMs) * 10) / 10 },
    },
    suites: suiteDelta,
    regression: b.overall.passRate < a.overall.passRate,
  });
});
