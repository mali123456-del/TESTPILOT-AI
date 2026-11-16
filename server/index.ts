import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import { getDb, loadDb, saveDb, audit, closeStorage, storageAdapterName } from './store.js';
import { seedDemo, isSeeded } from './seed.js';
import { createRun } from './engine/orchestrator.js';
import {
  attachAuth,
  apiLimiter,
  coreRouter,
  requireAuth,
  requireCsrf,
  type AuthedRequest,
} from './routes/core.js';
import { runsRouter, schedulesRouter, workflowsRouter } from './routes/runs.js';
import { aiRouter } from './routes/ai.js';
import { benchmarksRouter } from './routes/benchmarks.js';
import { providersRouter } from './routes/providers.js';
import { toolsRouter, verifyWorkspaceToken } from './routes/tools.js';
import { AGENTS } from './ai/agents.js';

const PORT = Number(process.env.PORT ?? 4318);
const IS_TEST = process.env.VITEST === 'true';
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

await loadDb();
if (!isSeeded()) {
  if (process.env.TESTPILOT_SEED !== '0') seedDemo();
  else console.log('[testpilot] empty database — register the first account to begin.');
}

// Recover runs interrupted by a restart. Manual runs pause so the tester can continue;
// engine-driven runs are marked interrupted because their worker no longer exists.
{
  const recovered = getDb();
  let changed = false;
  for (const run of recovered.runs) {
    if (run.status !== 'running') continue;
    if (run.mode === 'manual') {
      run.status = 'paused';
      run.pausedAt = new Date().toISOString();
      run.logs.push(`${run.pausedAt} paused automatically after a server restart`);
    } else {
      run.status = 'error';
      run.finishedAt = new Date().toISOString();
      run.logs.push(`${run.finishedAt} interrupted: the API restarted before the engine finished`);
    }
    changed = true;
  }
  if (changed) saveDb();
}

app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';",
  );
  if (process.env.TRUST_PROXY === '1') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', product: 'TESTPILOT AI', version: '1.0.0', uptimeSeconds: Math.round(process.uptime()), storage: storageAdapterName(), ai: process.env.AI_PROVIDER ?? 'local' });
});

/* Inbound CI hook: bearer token authentication, no session/CSRF. */
app.post('/api/hooks/run', (req: Request, res: Response) => {
  const auth = verifyWorkspaceToken(req.headers.authorization);
  if (!auth) return res.status(401).json({ error: 'Invalid or missing workspace API token' });
  const projectId = String(req.body?.projectId ?? '');
  const suiteId = req.body?.suiteId ? String(req.body.suiteId) : undefined;
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId && p.workspaceId === auth.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const caseIds = suiteId ? db.cases.filter((c) => c.suiteId === suiteId && c.enabled).map((c) => c.id) : db.cases.filter((c) => c.projectId === project.id && c.enabled).map((c) => c.id);
  if (!caseIds.length) return res.status(400).json({ error: 'No enabled cases' });
  const run = createRun({ workspaceId: auth.workspaceId, projectId, suiteId, caseIds, trigger: 'ci', actor: 'CI pipeline' });
  audit(auth.workspaceId, 'CI pipeline', 'run.triggered', run.id, { source: 'hook', cases: caseIds.length }, req.ip);
  res.status(202).json({ runId: run.id, statusUrl: `/api/runs/${run.id}` });
});

app.use('/api', (req: AuthedRequest, res: Response, next: NextFunction) => {
  const limit = apiLimiter.consume(`${req.ip}:${req.user?.id ?? 'anon'}`);
  if (!limit.ok) {
    res.setHeader('retry-after', String(limit.retryAfter));
    return res.status(429).json({ error: 'Rate limit exceeded. Slow down and retry shortly.' });
  }
  next();
});

app.use('/api', attachAuth);

const CSRF_EXEMPT = new Set(['/auth/login', '/auth/register', '/health']);
app.use('/api', (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (CSRF_EXEMPT.has(req.path)) return next();
  if (!req.session) return res.status(401).json({ error: 'Authentication required' });
  return requireCsrf(req, res, next);
});

app.use('/api', coreRouter);
app.use('/api/runs', runsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/ai/benchmarks', benchmarksRouter);
app.use('/api/ai', providersRouter);
app.use('/api/ai', aiRouter);
app.use('/api', toolsRouter);

app.get('/api/agents', requireAuth, (_req, res) => res.json(AGENTS));

/* Evidence artefacts (screenshots) require an authenticated session. */
app.use('/evidence', requireAuth, express.static(path.resolve(process.env.TESTPILOT_DATA_DIR ?? './data', 'evidence'), { fallthrough: false, index: false }));

const distDir = path.resolve('dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/evidence/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route not found' });
  return res.status(404).type('text/plain').send('Not found. Run `npm run dev` for the web client or `npm run build && npm start` for production.');
});

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[testpilot] request error', err.message);
  if (res.headersSent) return;
  const status = err.status ?? 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

/* Scheduler: evaluates due suites every 30s with a hard concurrency cap. */
setInterval(() => {
  if (!fs.existsSync(path.resolve(process.env.TESTPILOT_DATA_DIR ?? './data'))) return;
  const db = getDb();
  const nowMs = Date.now();
  for (const schedule of db.schedules.filter((s) => s.enabled)) {
    const last = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : 0;
    if (nowMs - last < schedule.intervalMinutes * 60_000) continue;
    const running = db.runs.filter((r) => r.workspaceId === schedule.workspaceId && ['queued', 'running'].includes(r.status)).length;
    if (running >= 2) break; // low-spec safeguard: never queue more than two concurrent runs
    const caseIds = db.cases.filter((c) => c.suiteId === schedule.suiteId && c.enabled).map((c) => c.id);
    if (!caseIds.length) continue;
    schedule.lastRunAt = new Date(nowMs).toISOString();
    createRun({ workspaceId: schedule.workspaceId, projectId: schedule.projectId, suiteId: schedule.suiteId, caseIds, trigger: 'schedule', actor: `Schedule: ${schedule.name}` });
  }
  saveDb();
}, 30_000).unref();

/* Session cleanup + graceful shutdown. */
setInterval(() => {
  const db = getDb();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now());
  if (before !== db.sessions.length) saveDb();
}, 3_600_000).unref();

process.on('SIGINT', async () => {
  saveDb();
  await closeStorage();
  process.exit(0);
});

if (!IS_TEST) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[testpilot] API ready on http://127.0.0.1:${PORT}`);
    console.log('[testpilot] demo account: demo@testpilot.ai / Demo1234! (seeded)');
  });
}

export { app };
