import type { Run, RunResult, TestCase, ResultStatus } from '../../shared/types.js';
import { getDb, id, now, saveDb } from '../store.js';
import { analyseFailures } from '../ai/provider.js';
import { runAccessibility, runApiCase, runDatabaseCase, runLoadTest, runSecurityScan, runUnitCase, runVisualCase, type EngineOutcome } from './runners.js';
import { runBrowserCase } from './playwright.js';

const cancelled = new Set<string>();
const listeners = new Map<string, Set<(run: Run) => void>>();
const MAX_CASE_TIMEOUT = 60_000;

export function onRunUpdate(runId: string, fn: (run: Run) => void): () => void {
  if (!listeners.has(runId)) listeners.set(runId, new Set());
  listeners.get(runId)!.add(fn);
  return () => listeners.get(runId)?.delete(fn);
}

function emit(run: Run): void {
  for (const fn of listeners.get(run.id) ?? []) {
    try {
      fn(run);
    } catch {
      /* listener failures must not break execution */
    }
  }
}

async function executeCase(testCase: TestCase, projectBaseUrl: string | undefined, allowedHosts: string[]): Promise<{ status: ResultStatus; message?: string; evidence?: string; details?: Record<string, unknown> }> {
  const target = testCase.targetUrl || testCase.request?.url || projectBaseUrl || '';
  const timeout = Math.min(testCase.timeoutMs || 15000, MAX_CASE_TIMEOUT);

  switch (testCase.type) {
    case 'unit':
      return runUnitCase(testCase.code ?? '', timeout);
    case 'api':
      return runApiCase(testCase.request, allowedHosts, timeout);
    case 'accessibility':
      return runAccessibility(target, allowedHosts, timeout);
    case 'security':
      return runSecurityScan(target, allowedHosts, timeout).then(({ score, findings }) => ({
        status: score >= 70 ? ('passed' as const) : ('failed' as const),
        message: `Security score ${score}/100 · ${findings.length} finding(s)`,
        evidence: findings.map((f) => `[${f.severity}] ${f.title}: ${f.description}`).join('\n') || 'No passive issues detected',
        details: { score, findings },
      }));
    case 'visual': {
      const baseline = (testCase.fixture as { baselineHash?: string } | undefined)?.baselineHash;
      const outcome = await runVisualCase(target, allowedHosts, baseline, timeout);
      if (outcome.details?.baseline && typeof outcome.details.hash === 'string') {
        testCase.fixture = { ...(testCase.fixture as object), baselineHash: outcome.details.hash };
        saveDb();
      }
      return outcome;
    }
    case 'database': {
      const fixture = testCase.fixture as { tables?: unknown; rules?: unknown } | undefined;
      return runDatabaseCase(fixture?.tables, fixture?.rules as never);
    }
    case 'performance': {
      if (!target) return { status: 'skipped', message: 'No performance target configured' };
      try {
        const cfg = (testCase.fixture as { requests?: number; concurrency?: number } | undefined) ?? {};
        const { metrics } = await runLoadTest(target, allowedHosts, Math.min(cfg.requests ?? 20, 100), Math.min(cfg.concurrency ?? 4, 10));
        const budget = testCase.request?.assertions?.maxLatencyMs ?? 1500;
        return {
          status: metrics.errorRate > 5 || metrics.p95 > budget ? 'failed' : 'passed',
          message: `p95 ${metrics.p95}ms (budget ${budget}ms) · ${metrics.rps} req/s · ${metrics.errorRate}% errors`,
          details: { metrics },
        };
      } catch (err) {
        return { status: 'error', message: err instanceof Error ? err.message : String(err) };
      }
    }
    case 'e2e':
    case 'ui':
    case 'cross-browser': {
      const shotDir = `data/evidence/${testCase.id}`;
      return runBrowserCase(testCase, shotDir);
    }
    default: {
      // integration / smoke / regression / acceptance: use the most specific available adapter.
      if (testCase.code) return runUnitCase(testCase.code, timeout);
      if (testCase.request) return runApiCase(testCase.request, allowedHosts, timeout);
      if (target) return runBrowserCase(testCase, `data/evidence/${testCase.id}`);
      return { status: 'skipped', message: 'No executable definition (add code, an API request or a target URL)' };
    }
  }
}

function withTimeout(p: Promise<EngineOutcome>, ms: number): Promise<EngineOutcome> {
  return Promise.race([
    p,
    new Promise<EngineOutcome>((resolve) =>
      setTimeout(() => resolve({ status: 'error', message: `Case exceeded the ${ms}ms execution budget` }), ms + 2000),
    ),
  ]);
}

export function createRun(opts: {
  workspaceId: string;
  projectId: string;
  caseIds: string[];
  trigger: Run['trigger'];
  actor: string;
  suiteId?: string;
}): Run {
  const db = getDb();
  const run: Run = {
    id: id('run'),
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    suiteId: opts.suiteId,
    status: 'queued',
    trigger: opts.trigger,
    triggeredBy: opts.actor,
    startedAt: now(),
    results: [],
    summary: { total: opts.caseIds.length, passed: 0, failed: 0, skipped: 0, error: 0 },
    logs: [`Run queued with ${opts.caseIds.length} case(s) by ${opts.actor}`],
  };
  db.runs.unshift(run);
  saveDb();
  void executeRun(run, opts.caseIds);
  return run;
}

export function cancelRun(runId: string): boolean {
  const db = getDb();
  const run = db.runs.find((r) => r.id === runId);
  if (!run || !['queued', 'running'].includes(run.status)) return false;
  cancelled.add(runId);
  run.logs.push('Cancellation requested');
  saveDb();
  return true;
}

async function executeRun(run: Run, caseIds: string[]): Promise<void> {
  const db = getDb();
  const project = db.projects.find((p) => p.id === run.projectId);
  const allowedHosts = [...(project?.allowedHosts ?? []), ...(db.workspaces.find((w) => w.id === run.workspaceId)?.allowedHosts ?? [])];
  const cases = caseIds.map((cid) => db.cases.find((c) => c.id === cid)).filter((c): c is TestCase => Boolean(c));
  run.status = 'running';
  emit(run);

  const CONCURRENCY = 3;
  let index = 0;
  const worker = async () => {
    while (index < cases.length) {
      if (cancelled.has(run.id)) return;
      const current = cases[index++];
      const started = Date.now();
      const result: RunResult = {
        caseId: current.id,
        title: current.title,
        type: current.type,
        status: 'error',
        durationMs: 0,
        startedAt: now(),
      };
      try {
        if (!current.enabled) {
          result.status = 'skipped';
          result.message = 'Case is disabled';
        } else {
          const outcome = await withTimeout(executeCase(current, project?.baseUrl, allowedHosts), current.timeoutMs || 15000);
          result.status = outcome.status;
          result.message = outcome.message;
          result.evidence = outcome.evidence?.slice(0, 8000);
          result.details = outcome.details;
        }
      } catch (err) {
        result.status = 'error';
        result.message = err instanceof Error ? err.message : String(err);
      }
      result.durationMs = Date.now() - started;
      run.results.push(result);
      run.summary = {
        total: cases.length,
        passed: run.results.filter((r) => r.status === 'passed').length,
        failed: run.results.filter((r) => r.status === 'failed').length,
        skipped: run.results.filter((r) => r.status === 'skipped').length,
        error: run.results.filter((r) => r.status === 'error').length,
      };
      run.logs.push(`${result.status.toUpperCase()} ${current.title} (${result.durationMs}ms)`);
      saveDb();
      emit(run);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length || 1) }, worker));

  if (cancelled.has(run.id)) {
    run.status = 'cancelled';
    run.logs.push('Run cancelled');
  } else {
    const { failed, error } = run.summary;
    run.status = error > 0 ? 'error' : failed > 0 ? 'failed' : 'passed';
    const failures = run.results.filter((r) => r.status === 'failed' || r.status === 'error');
    if (failures.length) {
      try {
        const { analysis, provider } = await analyseFailures(
          failures.map((f) => ({ title: f.title, message: f.message, type: f.type, durationMs: f.durationMs })),
        );
        run.aiAnalysis = `${analysis}\n\n_Generated by ${provider} provider_`;
      } catch {
        run.aiAnalysis = 'AI failure analysis was unavailable for this run.';
      }
    }
  }
  run.finishedAt = now();
  run.durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  cancelled.delete(run.id);
  saveDb();
  emit(run);
  updateProjectScore(run.projectId);
}

export function updateProjectScore(projectId: string): void {
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return;
  const runs = db.runs.filter((r) => r.projectId === projectId && r.finishedAt).slice(0, 10);
  if (!runs.length) {
    project.qualityScore = undefined;
    return;
  }
  const totalPassed = runs.reduce((n, r) => n + r.summary.passed, 0);
  const totalExecuted = runs.reduce((n, r) => n + r.summary.passed + r.summary.failed + r.summary.error, 0);
  const passRate = totalExecuted ? (totalPassed / totalExecuted) * 100 : 0;
  const criticalFailures = runs.reduce(
    (n, r) =>
      n +
      r.results.filter((res) => (res.status === 'failed' || res.status === 'error') && db.cases.find((c) => c.id === res.caseId)?.priority === 'critical').length,
    0,
  );
  const openBugs = db.bugs.filter((b) => b.projectId === projectId && b.status !== 'closed' && b.status !== 'resolved').length;
  const score = Math.max(0, Math.min(100, Math.round(passRate - criticalFailures * 6 - openBugs * 2)));
  project.qualityScore = score;
  saveDb();
}
