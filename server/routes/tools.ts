import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { ApiCollection, ApiRequestSpec, PerfRun, Report } from '../../shared/types.js';
import { getDb, id, now, saveDb, audit } from '../store.js';
import { sendApiRequest } from '../engine/runners.js';
import { runLoadTest } from '../engine/runners.js';
import { runSecurityScan } from '../engine/runners.js';
import { assertSafeUrl } from '../security.js';
import { playwrightStatus } from '../engine/playwright.js';
import { computeMetrics, entitlementsFor, requireAuth, requireRole, type AuthedRequest } from './core.js';

export const toolsRouter = Router();

function allowedFor(req: AuthedRequest): string[] {
  const db = getDb();
  const ws = db.workspaces.find((w) => w.id === req.user!.workspaceId);
  return ws?.allowedHosts ?? [];
}

/* ------------------------------------------------------- api workspace */
toolsRouter.get('/collections', requireAuth, (req: AuthedRequest, res) => {
  res.json(getDb().collections.filter((c) => c.workspaceId === req.user!.workspaceId));
});

toolsRouter.post('/collections', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      projectId: z.string(),
      name: z.string().min(2).max(100),
      environment: z.record(z.string()).optional(),
      requests: z.array(z.object({ name: z.string().max(100), spec: z.any() })).max(40).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid collection' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const collection: ApiCollection = {
    id: id('col'),
    workspaceId: req.user!.workspaceId,
    projectId: project.id,
    name: parsed.data.name,
    environment: parsed.data.environment ?? {},
    requests: (parsed.data.requests ?? []).map((r) => ({ id: id('req'), name: r.name, spec: r.spec as ApiRequestSpec })),
    createdAt: now(),
  };
  db.collections.push(collection);
  saveDb();
  res.status(201).json(collection);
});

const sendRequestHandler = async (req: AuthedRequest, res: import('express').Response) => {
  const parsed = z
    .object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']),
      url: z.string().min(4).max(2000),
      headers: z.record(z.string()).optional(),
      query: z.record(z.string()).optional(),
      body: z.string().max(100000).optional(),
      assertions: z.any().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  try {
    const { result, assertions } = await sendApiRequest(parsed.data as ApiRequestSpec, allowedFor(req), 20000);
    res.json({ result, assertions, passed: assertions.every((a) => a.ok) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Request failed' });
  }
};

toolsRouter.post('/collections/:id/send', requireAuth, requireRole('tester'), sendRequestHandler);
toolsRouter.post('/request/send', requireAuth, requireRole('tester'), sendRequestHandler);

/* ----------------------------------------------------- performance lab */
toolsRouter.get('/performance', requireAuth, (req: AuthedRequest, res) => {
  res.json(getDb().perfRuns.filter((p) => p.workspaceId === req.user!.workspaceId).slice(0, 30));
});

toolsRouter.post('/performance', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ projectId: z.string(), url: z.string().min(4).max(2000), requests: z.number().int().min(1).max(200).optional(), concurrency: z.number().int().min(1).max(20).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid load profile' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const record: PerfRun = {
    id: id('perf'),
    workspaceId: req.user!.workspaceId,
    projectId: project.id,
    url: parsed.data.url,
    method: 'GET',
    requests: Math.min(parsed.data.requests ?? 25, 200),
    concurrency: Math.min(parsed.data.concurrency ?? 4, 20),
    status: 'running',
    createdAt: now(),
  };
  db.perfRuns.unshift(record);
  try {
    const { metrics } = await runLoadTest(record.url, allowedFor(req), record.requests, record.concurrency);
    record.status = 'completed';
    record.metrics = metrics;
    saveDb();
    audit(req.user!.workspaceId, req.user!.name, 'perf.run', record.url, metrics, req.ip);
    res.status(201).json(record);
  } catch (err) {
    record.status = 'failed';
    saveDb();
    res.status(400).json({ error: err instanceof Error ? err.message : 'Load test failed' });
  }
});

/* ---------------------------------------------------------- security lab */
toolsRouter.get('/security', requireAuth, (req: AuthedRequest, res) => {
  res.json(getDb().securityScans.filter((s) => s.workspaceId === req.user!.workspaceId).slice(0, 30));
});

toolsRouter.post('/security/scan', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const parsed = z.object({ projectId: z.string(), url: z.string().min(4).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid scan target' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  try {
    const { score, findings } = await runSecurityScan(parsed.data.url, allowedFor(req), 20000);
    const scan = { id: id('sec'), workspaceId: req.user!.workspaceId, projectId: project.id, url: parsed.data.url, score, findings, createdAt: now() };
    db.securityScans.unshift(scan);
    saveDb();
    audit(req.user!.workspaceId, req.user!.name, 'security.scan', parsed.data.url, { score, findings: findings.length }, req.ip);
    res.status(201).json(scan);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Scan failed' });
  }
});

/* --------------------------------------------------------- integrations */
toolsRouter.get('/integrations', requireAuth, async (req: AuthedRequest, res) => {
  const db = getDb();
  const pw = await playwrightStatus();
  const items = db.integrations.filter((i) => i.workspaceId === req.user!.workspaceId).map((i) =>
    i.name === 'Playwright' ? { ...i, status: pw.available ? ('available' as const) : ('unavailable' as const), detail: pw.reason } : i,
  );
  res.json({ items, playwright: pw });
});

toolsRouter.patch('/integrations/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = z.object({ status: z.enum(['available', 'configured', 'unavailable']).optional(), detail: z.string().max(500).optional(), config: z.record(z.string()).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid integration patch' });
  const db = getDb();
  const integration = db.integrations.find((i) => i.id === req.params.id && i.workspaceId === req.user!.workspaceId);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });
  Object.assign(integration, parsed.data);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'integration.updated', integration.name, { status: integration.status }, req.ip);
  res.json(integration);
});

toolsRouter.post('/integrations/:id/test', requireAuth, requireRole('tester'), async (req: AuthedRequest, res) => {
  const db = getDb();
  const integration = db.integrations.find((i) => i.id === req.params.id && i.workspaceId === req.user!.workspaceId);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });
  if (integration.name === 'GitHub') {
    try {
      const repo = integration.config?.repo ?? 'mali123456-del/TESTPILOT-AI';
      const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'TESTPILOT-AI' }, signal: AbortSignal.timeout(10000) });
      return res.json({ ok: r.ok, detail: r.ok ? `Repository reachable (${repo})` : `GitHub responded ${r.status}`, checkedAt: now() });
    } catch (err) {
      return res.json({ ok: false, detail: err instanceof Error ? err.message : 'Network error', checkedAt: now() });
    }
  }
  if (integration.name === 'Playwright') {
    const pw = await playwrightStatus();
    return res.json({ ok: pw.available, detail: pw.reason, checkedAt: now() });
  }
  if (integration.name === 'GitHub Actions') {
    return res.json({ ok: true, detail: 'Inbound CI hook is available at POST /api/hooks/run with a workspace API token.', checkedAt: now() });
  }
  return res.json({ ok: integration.status !== 'unavailable', detail: `${integration.name}: ${integration.status === 'unavailable' ? 'not supported in this build' : 'configuration stored'}. No external call was attempted.`, checkedAt: now() });
});

/* --------------------------------------------------------------- reports */
toolsRouter.get('/reports', requireAuth, (req: AuthedRequest, res) => {
  res.json(getDb().reports.filter((r) => r.workspaceId === req.user!.workspaceId).slice(0, 40));
});

toolsRouter.post('/reports/generate', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z.object({ projectId: z.string(), kind: z.enum(['execution', 'quality', 'release']).optional(), title: z.string().trim().min(1).max(120).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid report request' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const metrics = computeMetrics(req.user!.workspaceId);
  const runs = db.runs.filter((r) => r.projectId === project.id).slice(0, 10);
  const bugs = db.bugs.filter((b) => b.projectId === project.id);
  const kind = parsed.data.kind ?? 'quality';
  const report: Report = {
    id: id('rep'),
    workspaceId: req.user!.workspaceId,
    projectId: project.id,
    title: parsed.data.title ?? `${project.name} ${kind} report`,
    kind,
    summary:
      kind === 'release'
        ? `Release readiness ${metrics.readiness}/100 with ${metrics.openBugs} open defect(s) and ${metrics.flaky.length} flaky case(s).`
        : `Pass rate ${metrics.passRate}% across ${metrics.executed} executed results; coverage ${metrics.coverage}%.`,
    data: {
      generatedAt: now(),
      project: { name: project.name, key: project.key, environment: project.environment, qualityScore: project.qualityScore },
      metrics: {
        passRate: metrics.passRate,
        coverage: metrics.coverage,
        readiness: metrics.readiness,
        readinessBreakdown: metrics.readinessBreakdown,
        flaky: metrics.flaky,
        coverageByType: metrics.coverageByType,
      },
      runs: runs.map((r) => ({ id: r.id, status: r.status, at: r.finishedAt, summary: r.summary, trigger: r.trigger })),
      defects: { total: bugs.length, open: bugs.filter((b) => b.status === 'open' || b.status === 'in_progress').length, items: bugs.slice(0, 10) },
      recommendations: [
        metrics.criticalFailures ? 'Resolve critical failures before release.' : 'No critical failures recorded.',
        metrics.flaky.length ? `Quarantine ${metrics.flaky.length} flaky case(s) and re-run in isolation.` : 'No flaky cases detected in the recent window.',
        metrics.coverage < 70 ? 'Increase executed coverage above 70%.' : 'Coverage is acceptable for the current scope.',
      ],
    },
    createdBy: req.user!.name,
    createdAt: now(),
  };
  db.reports.unshift(report);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'report.generated', report.title, { kind }, req.ip);
  res.status(201).json(report);
});

toolsRouter.get('/reports/:id/export', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const report = db.reports.find((r) => r.id === req.params.id && r.workspaceId === req.user!.workspaceId);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const format = String(req.query.format ?? 'json');
  if (format === 'json') {
    res.setHeader('content-disposition', `attachment; filename="${report.id}.json"`);
    res.setHeader('content-type', 'application/json');
    return res.send(JSON.stringify(report, null, 2));
  }
  const data = report.data as { project?: { name?: string }; metrics?: Record<string, unknown> };
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(report.title)}</title>
<style>body{font:15px/1.6 'Segoe UI',system-ui,sans-serif;color:#0f172a;max-width:860px;margin:40px auto;padding:0 24px}header{border-bottom:3px solid #6d5efc;padding-bottom:16px;margin-bottom:24px}h1{margin:0 0 4px;font-size:26px}h2{margin-top:32px;font-size:18px}.meta{color:#64748b;font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.card{border:1px solid #e2e8f0;border-radius:10px;padding:12px}.card b{display:block;font-size:24px}.badge{display:inline-block;background:#eef2ff;color:#4338ca;padding:2px 8px;border-radius:999px;font-size:12px}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}td,th{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}footer{margin-top:40px;color:#94a3b8;font-size:12px}@media print{body{margin:0}}</style></head>
<body><header><span class="badge">TESTPILOT AI</span><h1>${esc(report.title)}</h1>
<div class="meta">${esc(data.project?.name)} · generated ${esc(report.createdAt)} by ${esc(report.createdBy)}</div></header>
<p>${esc(report.summary)}</p>
<div class="grid">
<div class="card"><b>${esc((data.metrics as { passRate?: number })?.passRate ?? 0)}%</b>Pass rate</div>
<div class="card"><b>${esc((data.metrics as { coverage?: number })?.coverage ?? 0)}%</b>Case coverage</div>
<div class="card"><b>${esc((data.metrics as { readiness?: number })?.readiness ?? 0)}/100</b>Release readiness</div>
</div>
<h2>Runs</h2><table><tr><th>Run</th><th>Status</th><th>Passed</th><th>Failed</th><th>Trigger</th></tr>
${((report.data.runs as Array<{ id: string; status: string; summary: { passed: number; failed: number }; trigger: string }>) ?? [])
  .map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.status)}</td><td>${esc(r.summary.passed)}</td><td>${esc(r.summary.failed)}</td><td>${esc(r.trigger)}</td></tr>`)
  .join('')}</table>
<h2>Recommendations</h2><ul>${((report.data.recommendations as string[]) ?? []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
<footer>Generated by TESTPILOT AI · Build Better. Test Smarter. Ship Confidently. · Print this page to save as PDF.</footer></body></html>`;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  return res.send(html);
});

/* ---------------------------------------------------------------- billing */
toolsRouter.post('/billing/plan', requireAuth, requireRole('owner'), (req: AuthedRequest, res) => {
  const parsed = z.object({ plan: z.enum(['free', 'pro', 'ultimate', 'business']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid plan' });
  const db = getDb();
  const workspace = db.workspaces.find((w) => w.id === req.user!.workspaceId)!;
  workspace.plan = parsed.data.plan;
  saveDb();
  audit(workspace.id, req.user!.name, 'billing.plan_changed', parsed.data.plan, { simulated: true }, req.ip);
  res.json({
    workspace,
    entitlements: entitlementsFor(workspace.plan),
    note: 'Plan change is simulated in this build. No payment was taken and no external billing provider was contacted.',
  });
});

/* ----------------------------------------------------------- CI inbound */
toolsRouter.post('/workspace/token', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const token = crypto.randomBytes(24).toString('base64url');
  const db = getDb();
  const workspace = db.workspaces.find((w) => w.id === req.user!.workspaceId)! as typeof db.workspaces[number] & { apiTokenHash?: string };
  workspace.apiTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  saveDb();
  audit(workspace.id, req.user!.name, 'workspace.token_rotated', undefined, undefined, req.ip);
  res.json({ token, note: 'Store this token now — it is hashed at rest and cannot be shown again.' });
});

export function verifyWorkspaceToken(authorization: string | undefined): { workspaceId: string } | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const hash = crypto.createHash('sha256').update(authorization.slice(7)).digest('hex');
  const db = getDb();
  const workspace = db.workspaces.find((w) => (w as typeof w & { apiTokenHash?: string }).apiTokenHash === hash);
  return workspace ? { workspaceId: workspace.id } : null;
}

export { assertSafeUrl };
