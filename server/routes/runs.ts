import { Router } from 'express';
import { z } from 'zod';
import { getDb, id, now, saveDb, audit } from '../store.js';
import { createRun, cancelRun, onRunUpdate } from '../engine/orchestrator.js';
import { requireAuth, requireRole, type AuthedRequest } from './core.js';
import type { Run, Workflow } from '../../shared/types.js';

export const runsRouter = Router();

function summarize(results: Array<{ status: string }>) {
  const counts = { passed: 0, failed: 0, blocked: 0, skipped: 0, error: 0, notRun: 0 };
  for (const r of results) {
    if (r.status === 'passed') counts.passed += 1;
    else if (r.status === 'failed') counts.failed += 1;
    else if (r.status === 'blocked') counts.blocked += 1;
    else if (r.status === 'skipped') counts.skipped += 1;
    else if (r.status === 'error') counts.error += 1;
    else counts.notRun += 1;
  }
  return { total: results.length, ...counts };
}

/** Only draft/paused/running manual runs can accept edits. */
const ACTIVE_MANUAL = new Set(['draft', 'running', 'paused']);

runsRouter.get('/history', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  const suiteId = typeof req.query.suiteId === 'string' ? req.query.suiteId : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
  const from = typeof req.query.from === 'string' ? Date.parse(req.query.from) : NaN;
  const to = typeof req.query.to === 'string' ? Date.parse(req.query.to) : NaN;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize ?? 20) || 20));

  let items = db.runs.filter((r) => r.workspaceId === req.user!.workspaceId);
  if (projectId) items = items.filter((r) => r.projectId === projectId);
  if (suiteId) items = items.filter((r) => r.suiteId === suiteId);
  if (status && status !== 'all') items = items.filter((r) => r.status === status);
  if (mode && mode !== 'all') items = items.filter((r) => (r.mode ?? 'automated') === mode);
  if (q) {
    items = items.filter((r) => {
      const project = db.projects.find((p) => p.id === r.projectId)?.name ?? '';
      return `${r.id} ${r.triggeredBy} ${r.assignee ?? ''} ${project}`.toLowerCase().includes(q);
    });
  }
  if (!Number.isNaN(from)) items = items.filter((r) => Date.parse(r.startedAt) >= from);
  if (!Number.isNaN(to)) items = items.filter((r) => Date.parse(r.startedAt) <= to);

  items = [...items].sort((a, b) => {
    if (sort === 'oldest') return Date.parse(a.startedAt) - Date.parse(b.startedAt);
    if (sort === 'duration') return (b.durationMs ?? 0) - (a.durationMs ?? 0);
    return Date.parse(b.startedAt) - Date.parse(a.startedAt);
  });

  const total = items.length;
  const start = (page - 1) * pageSize;
  res.json({
    items: items.slice(start, start + pageSize).map((r) => ({ ...r, results: r.results.slice(0, 60) })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
});


runsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  res.json(
    db.runs
      .filter((r) => r.workspaceId === req.user!.workspaceId && (projectId ? r.projectId === projectId : true))
      .slice(0, limit)
      .map((r) => ({ ...r, results: r.results.slice(0, 60) })),
  );
});

runsRouter.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const run = db.runs.find((r) => r.id === req.params.id && r.workspaceId === req.user!.workspaceId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

runsRouter.post('/', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      projectId: z.string(),
      suiteId: z.string().optional(),
      caseIds: z.array(z.string()).max(100).optional(),
      trigger: z.enum(['manual', 'schedule', 'webhook', 'ci']).optional(),
      mode: z.enum(['automated', 'manual']).optional(),
      assignee: z.string().max(80).optional(),
      force: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid run payload' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  let caseIds = parsed.data.caseIds ?? [];
  if (!caseIds.length && parsed.data.suiteId) {
    caseIds = db.cases.filter((c) => c.suiteId === parsed.data.suiteId && c.projectId === project.id && c.enabled).map((c) => c.id);
  }
  if (!caseIds.length) return res.status(400).json({ error: 'No executable cases selected' });

  if (parsed.data.mode === 'manual') {
    const cases = db.cases.filter((c) => caseIds.includes(c.id) && c.projectId === project.id && c.workspaceId === req.user!.workspaceId);
    if (!cases.length) return res.status(400).json({ error: 'No valid cases selected for this project' });
    // Prevent accidental duplicate execution of the same suite by the same tester.
    const active = db.runs.find(
      (r) =>
        r.mode === 'manual' &&
        r.projectId === project.id &&
        (r.suiteId ?? '') === (parsed.data.suiteId ?? '') &&
        r.triggeredBy === req.user!.name &&
        ACTIVE_MANUAL.has(r.status),
    );
    if (active && !parsed.data.force) {
      return res.status(409).json({ error: 'An active manual run already exists for this suite. Resume it instead.', runId: active.id });
    }
    const startedAt = now();
    const results = cases.map((c) => ({
      caseId: c.id,
      title: c.title,
      type: c.type,
      status: 'not-run' as const,
      durationMs: 0,
    }));
    const manualRun = {
      id: id('run'),
      workspaceId: req.user!.workspaceId,
      projectId: project.id,
      suiteId: parsed.data.suiteId,
      status: 'draft' as const,
      mode: 'manual' as const,
      trigger: parsed.data.trigger ?? 'manual',
      triggeredBy: req.user!.name,
      assignee: parsed.data.assignee,
      startedAt,
      results,
      summary: summarize(results),
      logs: [`Manual run created with ${results.length} case(s).`],
    };
    db.runs.push(manualRun as (typeof db.runs)[number]);
    saveDb();
    audit(req.user!.workspaceId, req.user!.name, 'run.manual_created', manualRun.id, { project: project.name, cases: results.length }, req.ip);
    return res.status(201).json(manualRun);
  }

  const run = createRun({
    workspaceId: req.user!.workspaceId,
    projectId: project.id,
    suiteId: parsed.data.suiteId,
    caseIds,
    trigger: parsed.data.trigger ?? 'manual',
    actor: req.user!.name,
  });
  audit(req.user!.workspaceId, req.user!.name, 'run.triggered', run.id, { project: project.name, cases: caseIds.length }, req.ip);
  res.status(202).json(run);
});

/** Manual execution state transitions. */
type ManualLookup = { error: { code: number; message: string } } | { db: ReturnType<typeof getDb>; run: Run };

function findManualRun(req: AuthedRequest): ManualLookup {
  const db = getDb();
  const run = db.runs.find((r) => r.id === req.params.id && r.workspaceId === req.user!.workspaceId);
  if (!run) return { error: { code: 404, message: 'Run not found' } };
  if (run.mode !== 'manual') return { error: { code: 409, message: 'This run is engine driven and cannot be edited manually' } };
  return { db, run: run as Run };
}

runsRouter.post('/:id/start', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const found = findManualRun(req);
  if ('error' in found) return res.status(found.error.code).json({ error: found.error.message });
  const { run } = found;
  if (run.status !== 'draft') return res.status(409).json({ error: `Cannot start a run in status ${run.status}` });
  run.status = 'running';
  run.startedAt = now();
  run.logs.push(`${now()} started by ${req.user!.name}`);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'run.started', run.id, undefined, req.ip);
  res.json(run);
});

runsRouter.post('/:id/pause', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const found = findManualRun(req);
  if ('error' in found) return res.status(found.error.code).json({ error: found.error.message });
  const { run } = found;
  if (run.status !== 'running') return res.status(409).json({ error: `Cannot pause a run in status ${run.status}` });
  run.status = 'paused';
  run.pausedAt = now();
  run.logs.push(`${now()} paused by ${req.user!.name}`);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'run.paused', run.id, undefined, req.ip);
  res.json(run);
});

runsRouter.post('/:id/resume', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const found = findManualRun(req);
  if ('error' in found) return res.status(found.error.code).json({ error: found.error.message });
  const { run } = found;
  if (run.status !== 'paused') return res.status(409).json({ error: `Cannot resume a run in status ${run.status}` });
  run.status = 'running';
  run.resumedAt = now();
  run.logs.push(`${now()} resumed by ${req.user!.name}`);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'run.resumed', run.id, undefined, req.ip);
  res.json(run);
});

runsRouter.post('/:id/results/:caseId', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      status: z.enum(['not-run', 'passed', 'failed', 'blocked', 'skipped']),
      actualResult: z.string().max(4000).optional(),
      notes: z.string().max(4000).optional(),
      attachments: z.array(z.string().max(2000)).max(20).optional(),
      durationMs: z.number().int().min(0).max(86_400_000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid result payload' });
  const found = findManualRun(req);
  if ('error' in found) return res.status(found.error.code).json({ error: found.error.message });
  const { run } = found;
  if (!ACTIVE_MANUAL.has(run.status)) return res.status(409).json({ error: 'Run is closed; results cannot be changed' });
  const result = run.results.find((r) => r.caseId === req.params.caseId);
  if (!result) return res.status(404).json({ error: 'Case is not part of this run' });
  if (run.status === 'draft') {
    run.status = 'running';
    run.startedAt = now();
  }
  result.status = parsed.data.status;
  result.actualResult = parsed.data.actualResult;
  result.notes = parsed.data.notes;
  result.attachments = parsed.data.attachments;
  result.durationMs = parsed.data.durationMs ?? 0;
  result.executedBy = req.user!.name;
  result.executedAt = parsed.data.status === 'not-run' ? undefined : now();
  if (parsed.data.status === 'failed') {
    result.message = parsed.data.actualResult || parsed.data.notes || 'Marked failed by tester';
  } else if (parsed.data.status === 'blocked') {
    result.message = parsed.data.actualResult || parsed.data.notes || 'Blocked by tester';
  }
  run.summary = summarize(run.results);
  run.logs.push(`${now()} ${result.caseId} → ${parsed.data.status} (${req.user!.name})`);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'run.result_recorded', run.id, { caseId: result.caseId, status: parsed.data.status }, req.ip);
  res.json(run);
});

runsRouter.post('/:id/complete', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const found = findManualRun(req);
  if ('error' in found) return res.status(found.error.code).json({ error: found.error.message });
  const { run } = found;
  if (run.status === 'draft' || !ACTIVE_MANUAL.has(run.status)) {
    return res.status(409).json({ error: `Cannot complete a run in status ${run.status}` });
  }
  const remaining = run.results.filter((r) => r.status === 'not-run').length;
  if (remaining > 0) return res.status(400).json({ error: `${remaining} case(s) still have no result` });
  run.summary = summarize(run.results);
  run.status = run.summary.failed > 0 ? 'failed' : (run.summary.blocked ?? 0) > 0 ? 'blocked' : 'passed';
  run.finishedAt = now();
  run.durationMs = Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
  run.logs.push(`${now()} completed as ${run.status} by ${req.user!.name}`);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'run.completed', run.id, { status: run.status, summary: run.summary }, req.ip);
  res.json(run);
});


runsRouter.post('/:id/retry', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const db = getDb();
  const run = db.runs.find((r) => r.id === req.params.id && r.workspaceId === req.user!.workspaceId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const failedCaseIds = run.results.filter(r => r.status === 'failed' || r.status === 'error').map(r => r.caseId);
  if (!failedCaseIds.length) return res.status(400).json({ error: 'No failures to retry' });

  const newRun = createRun({
    workspaceId: req.user!.workspaceId,
    projectId: run.projectId,
    suiteId: run.suiteId,
    caseIds: failedCaseIds,
    trigger: 'manual',
    actor: req.user!.name,
  });
  audit(req.user!.workspaceId, req.user!.name, 'run.retried', newRun.id, { originalRunId: run.id, cases: failedCaseIds.length }, req.ip);
  res.status(202).json(newRun);
});

runsRouter.post('/:id/cancel', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const db = getDb();
  const run = db.runs.find((r) => r.id === req.params.id && r.workspaceId === req.user!.workspaceId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.mode === 'manual') {
    if (!ACTIVE_MANUAL.has(run.status)) return res.status(409).json({ error: `Run is already ${run.status}` });
    run.status = 'cancelled';
    run.finishedAt = now();
    run.durationMs = Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
    run.logs.push(`${now()} cancelled by ${req.user!.name}`);
    saveDb();
    audit(req.user!.workspaceId, req.user!.name, 'run.cancelled', run.id, undefined, req.ip);
    return res.json({ ok: true, run });
  }
  const ok = cancelRun(run.id);
  audit(req.user!.workspaceId, req.user!.name, 'run.cancelled', run.id, undefined, req.ip);
  res.json({ ok });
});

/** Server-sent events for live run progress. */
runsRouter.get('/:id/stream', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const run = db.runs.find((r) => r.id === req.params.id && r.workspaceId === req.user!.workspaceId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send(run);
  const unsubscribe = onRunUpdate(run.id, (updated) => send(updated));
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

/* --------------------------------------------------------------- schedules */
export const schedulesRouter = Router();

schedulesRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  res.json(getDb().schedules.filter((s) => s.workspaceId === req.user!.workspaceId));
});

schedulesRouter.post('/', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({ projectId: z.string(), suiteId: z.string(), name: z.string().min(2).max(80), intervalMinutes: z.number().int().min(5).max(10080), enabled: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid schedule' });
  const db = getDb();
  const suite = db.suites.find((s) => s.id === parsed.data.suiteId && s.workspaceId === req.user!.workspaceId);
  if (!suite) return res.status(404).json({ error: 'Suite not found' });
  const schedule = {
    id: id('sch'),
    workspaceId: req.user!.workspaceId,
    projectId: parsed.data.projectId,
    suiteId: suite.id,
    name: parsed.data.name,
    intervalMinutes: parsed.data.intervalMinutes,
    enabled: parsed.data.enabled ?? true,
    createdAt: now(),
  };
  db.schedules.push(schedule);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'schedule.created', schedule.name, undefined, req.ip);
  res.status(201).json(schedule);
});

schedulesRouter.patch('/:id', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const parsed = z.object({ enabled: z.boolean().optional(), intervalMinutes: z.number().int().min(5).max(10080).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid schedule patch' });
  const db = getDb();
  const schedule = db.schedules.find((s) => s.id === req.params.id && s.workspaceId === req.user!.workspaceId);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  Object.assign(schedule, parsed.data);
  saveDb();
  res.json(schedule);
});

schedulesRouter.delete('/:id', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const db = getDb();
  db.schedules = db.schedules.filter((s) => !(s.id === req.params.id && s.workspaceId === req.user!.workspaceId));
  saveDb();
  res.json({ ok: true });
});

/* --------------------------------------------------------------- workflows */
export const workflowsRouter = Router();

workflowsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  res.json(getDb().workflows.filter((w) => w.workspaceId === req.user!.workspaceId));
});

workflowsRouter.post('/', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      projectId: z.string(),
      name: z.string().min(2).max(100),
      steps: z
        .array(
          z.object({
            type: z.enum(['run-suite', 'api-request', 'delay', 'condition', 'approval', 'notify']),
            label: z.string().max(120),
            config: z.record(z.any()),
          }),
        )
        .max(20),
      parallel: z.boolean().optional(),
      retry: z.object({ attempts: z.number().int().min(0).max(5), backoffMs: z.number().int().min(0).max(30000) }).optional(),
      timeoutMs: z.number().int().min(1000).max(3600000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid workflow' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const workflow: Workflow = {
    id: id('wf'),
    workspaceId: req.user!.workspaceId,
    projectId: project.id,
    name: parsed.data.name,
    enabled: true,
    steps: parsed.data.steps.map((s) => ({ ...s, id: id('stp') })),
    retry: parsed.data.retry ?? { attempts: 1, backoffMs: 1000 },
    parallel: parsed.data.parallel ?? false,
    timeoutMs: parsed.data.timeoutMs ?? 600000,
    createdAt: now(),
  };
  db.workflows.push(workflow);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'workflow.created', workflow.name, undefined, req.ip);
  res.status(201).json(workflow);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 15000)));

workflowsRouter.post('/:id/run', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const db = getDb();
  const workflow = db.workflows.find((w) => w.id === req.params.id && w.workspaceId === req.user!.workspaceId);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  if (!workflow.enabled) return res.status(409).json({ error: 'Workflow is disabled' });
  const started = Date.now();
  const log: Array<{ step: string; type: string; status: string; detail?: string }> = [];
  const runIds: string[] = [];
  let halted = false;

  for (const step of workflow.steps) {
    if (Date.now() - started > workflow.timeoutMs) {
      log.push({ step: step.label, type: step.type, status: 'timeout' });
      halted = true;
      break;
    }
    try {
      if (step.type === 'run-suite') {
        const suiteId = String(step.config.suiteId ?? '');
        const caseIds = getDb().cases.filter((c) => c.suiteId === suiteId && c.enabled).map((c) => c.id);
        if (!caseIds.length) {
          log.push({ step: step.label, type: step.type, status: 'skipped', detail: 'Suite has no enabled cases' });
          continue;
        }
        const run = createRun({ workspaceId: req.user!.workspaceId, projectId: workflow.projectId, suiteId, caseIds, trigger: 'webhook', actor: `Workflow: ${workflow.name}` });
        runIds.push(run.id);
        // Wait for completion so conditional steps are meaningful.
        const deadline = Math.min(step.config.timeoutMs ? Number(step.config.timeoutMs) : 120000, 120000);
        const waitStart = Date.now();
        while (Date.now() - waitStart < deadline) {
          const current = getDb().runs.find((r) => r.id === run.id);
          if (current && current.finishedAt) break;
          await sleep(250);
        }
        const final = getDb().runs.find((r) => r.id === run.id);
        log.push({ step: step.label, type: step.type, status: final?.status ?? 'unknown', detail: `run ${run.id}` });
        if (step.config.on === 'failure' && (final?.status === 'failed' || final?.status === 'error')) {
          if (step.config.action === 'stop') halted = true;
        }
        if (halted) break;
      } else if (step.type === 'delay') {
        await sleep(Number(step.config.ms ?? 1000));
        log.push({ step: step.label, type: step.type, status: 'completed' });
      } else if (step.type === 'approval') {
        db.approvals.push({
          id: id('apr'),
          workspaceId: req.user!.workspaceId,
          kind: 'workflow.approval',
          title: `${workflow.name}: ${step.label}`,
          payload: { workflowId: workflow.id, stepId: step.id, runIds },
          requestedBy: req.user!.name,
          status: 'pending',
          createdAt: now(),
        });
        log.push({ step: step.label, type: step.type, status: 'awaiting_approval' });
        halted = true;
        break;
      } else if (step.type === 'notify') {
        log.push({ step: step.label, type: step.type, status: 'completed', detail: `Notified ${String(step.config.channel ?? 'channel')} (in-app)` });
      } else if (step.type === 'condition') {
        log.push({ step: step.label, type: step.type, status: 'evaluated' });
      } else if (step.type === 'api-request') {
        log.push({ step: step.label, type: step.type, status: 'skipped', detail: 'Use the API workspace for ad-hoc requests' });
      }
    } catch (err) {
      log.push({ step: step.label, type: step.type, status: 'error', detail: err instanceof Error ? err.message : String(err) });
      halted = true;
    }
  }

  workflow.lastRunAt = now();
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'workflow.run', workflow.name, { runIds }, req.ip);
  res.json({ workflowId: workflow.id, runIds, halted, durationMs: Date.now() - started, log });
});
