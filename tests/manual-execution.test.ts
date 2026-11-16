import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testpilot-manual-'));
process.env.TESTPILOT_DATA_DIR = dataDir;
process.env.TESTPILOT_SEED = '0';
process.env.VITEST = 'true';

let server: Server;
let base = '';
let cookie = '';
let csrf = '';
let projectId = '';
let suiteId = '';
let caseA = '';
let caseB = '';
let runId = '';

async function call(pathname: string, opts: { method?: string; body?: unknown; useCsrf?: boolean } = {}) {
  const res = await fetch(`${base}/api${pathname}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(opts.useCsrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data: data as Record<string, unknown> };
}

beforeAll(async () => {
  const mod = await import('../server/index');
  await new Promise<void>((resolve) => {
    server = mod.app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('manual execution engine', () => {
  it('sets up an owner, project, suite and cases', async () => {
    const reg = await call('/auth/register', {
      method: 'POST',
      body: { name: 'Manual Owner', email: 'manual@test.local', password: 'Str0ngPass!', workspaceName: 'Manual Lab' },
    });
    expect(reg.status).toBe(201);
    csrf = String(reg.data.csrfToken);

    const project = await call('/projects', { method: 'POST', useCsrf: true, body: { name: 'Manual Project', key: 'MP', baseUrl: 'https://example.test', allowedHosts: ['example.test'] } });
    expect(project.status).toBe(201);
    projectId = String(project.data.id);

    const suite = await call('/suites', { method: 'POST', useCsrf: true, body: { projectId, name: 'Checkout', type: 'unit' } });
    expect(suite.status).toBe(201);
    suiteId = String(suite.data.id);

    const one = await call('/cases', {
      method: 'POST',
      useCsrf: true,
      body: { suiteId, title: 'Cart totals are correct', type: 'unit', priority: 'critical', steps: ['Add one item', 'Open cart'], expected: 'Totals match', code: 'expect(1+1).toBe(2);' },
    });
    expect(one.status).toBe(201);
    caseA = String(one.data.id);

    const two = await call('/cases', {
      method: 'POST',
      useCsrf: true,
      body: { suiteId, title: 'Coupon applies once', type: 'unit', priority: 'high', steps: ['Apply SAVE10'], expected: 'Discount applied once' },
    });
    expect(two.status).toBe(201);
    caseB = String(two.data.id);
  });

  it('creates a draft manual run with not-run results', async () => {
    const res = await call('/runs', {
      method: 'POST',
      useCsrf: true,
      body: { projectId, suiteId, caseIds: [caseA, caseB], mode: 'manual', assignee: 'Manual Owner' },
    });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe('draft');
    expect(res.data.mode).toBe('manual');
    const results = res.data.results as Array<{ status: string }>;
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'not-run')).toBe(true);
    runId = String(res.data.id);
  });

  it('prevents accidental duplicate manual runs for the same suite', async () => {
    const res = await call('/runs', {
      method: 'POST',
      useCsrf: true,
      body: { projectId, suiteId, caseIds: [caseA], mode: 'manual' },
    });
    expect(res.status).toBe(409);
    expect(res.data.runId).toBe(runId);
  });

  it('starts, pauses and resumes the run', async () => {
    const start = await call(`/runs/${runId}/start`, { method: 'POST', useCsrf: true });
    expect(start.status).toBe(200);
    expect(start.data.status).toBe('running');

    const pause = await call(`/runs/${runId}/pause`, { method: 'POST', useCsrf: true });
    expect(pause.status).toBe(200);
    expect(pause.data.status).toBe('paused');

    const resume = await call(`/runs/${runId}/resume`, { method: 'POST', useCsrf: true });
    expect(resume.status).toBe(200);
    expect(resume.data.status).toBe('running');
  });

  it('records a passing result with actual output and evidence', async () => {
    const res = await call(`/runs/${runId}/results/${caseA}`, {
      method: 'POST',
      useCsrf: true,
      body: { status: 'passed', actualResult: 'Cart total matched', notes: 'Chromium 120', attachments: ['https://example.test/evidence/1'] },
    });
    expect(res.status).toBe(200);
    const summary = res.data.summary as Record<string, number>;
    expect(summary.passed).toBe(1);
    expect(summary.notRun).toBe(1);
    const results = res.data.results as Array<{ caseId: string; status: string; executedBy?: string; actualResult?: string }>;
    const recorded = results.find((r) => r.caseId === caseA);
    expect(recorded?.status).toBe('passed');
    expect(recorded?.executedBy).toBe('Manual Owner');
    expect(recorded?.actualResult).toBe('Cart total matched');
  });

  it('refuses to complete while a case has no result', async () => {
    const res = await call(`/runs/${runId}/complete`, { method: 'POST', useCsrf: true });
    expect(res.status).toBe(400);
    expect(String(res.data.error)).toContain('no result');
  });

  it('records blocked and completes as blocked', async () => {
    const blocked = await call(`/runs/${runId}/results/${caseB}`, {
      method: 'POST',
      useCsrf: true,
      body: { status: 'blocked', actualResult: 'Coupon service unavailable in staging' },
    });
    expect(blocked.status).toBe(200);

    const complete = await call(`/runs/${runId}/complete`, { method: 'POST', useCsrf: true });
    expect(complete.status).toBe(200);
    expect(complete.data.status).toBe('blocked');
    expect(complete.data.finishedAt).toBeTruthy();
  });

  it('rejects result changes after the run is closed', async () => {
    const res = await call(`/runs/${runId}/results/${caseA}`, { method: 'POST', useCsrf: true, body: { status: 'failed', actualResult: 'changed' } });
    expect(res.status).toBe(409);
  });

  it('exposes filtered, paginated run history', async () => {
    const res = await call('/runs/history?mode=manual&status=blocked&page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.data.total).toBe(1);
    const items = res.data.items as Array<{ id: string }>;
    expect(items[0].id).toBe(runId);
    const automated = await call('/runs/history?mode=automated');
    expect(automated.status).toBe(200);
    expect(automated.data.total).toBe(0);
  });

  it('returns per-case execution history even after the case is deleted', async () => {
    const before = await call(`/cases/${caseB}/history`);
    expect(before.status).toBe(200);
    const runs = before.data.runs as Array<{ runId: string; status: string; actualResult?: string }>;
    expect(runs[0].runId).toBe(runId);
    expect(runs[0].status).toBe('blocked');

    const del = await call(`/cases/${caseB}`, { method: 'DELETE', useCsrf: true });
    expect(del.status).toBe(200);

    const after = await call(`/cases/${caseB}/history`);
    expect(after.status).toBe(200);
    const kept = after.data.runs as Array<{ runId: string }>;
    expect(kept[0].runId).toBe(runId);
  });

  it('blocks viewers from recording results', async () => {
    const invite = await call('/workspace/members', {
      method: 'POST',
      useCsrf: true,
      body: { name: 'Read Only', email: 'manual-viewer@test.local', role: 'viewer', password: 'V1ewerPass!' },
    });
    expect(invite.status).toBe(201);
    const ownerCookie = cookie;
    cookie = '';
    const login = await call('/auth/login', { method: 'POST', body: { email: 'manual-viewer@test.local', password: 'V1ewerPass!' } });
    expect(login.status).toBe(200);
    csrf = String(login.data.csrfToken);
    const denied = await call(`/runs/${runId}/results/${caseA}`, { method: 'POST', useCsrf: true, body: { status: 'passed' } });
    expect(denied.status).toBe(403);
    cookie = ownerCookie;
    const me = await call('/auth/me');
    csrf = String(me.data.csrfToken);
  });
});
