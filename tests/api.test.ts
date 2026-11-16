import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testpilot-test-'));
process.env.TESTPILOT_DATA_DIR = dataDir;
process.env.TESTPILOT_SEED = '0';
process.env.VITEST = 'true';

let server: Server;
let base = '';
let cookie = '';
let csrf = '';
let projectId = '';
let suiteId = '';
let caseId = '';

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
  return { status: res.status, data: data as Record<string, unknown>, text };
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

describe('API integration', () => {
  it('exposes a public health endpoint', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
    expect(res.data.product).toBe('TESTPILOT AI');
  });

  it('rejects unauthenticated access to workspace data', async () => {
    const res = await call('/projects');
    expect(res.status).toBe(401);
  });

  it('registers an owner and issues a session with a CSRF token', async () => {
    const res = await call('/auth/register', {
      method: 'POST',
      body: { name: 'Test Owner', email: 'owner@test.local', password: 'Str0ngPass!', workspaceName: 'Integration Lab' },
    });
    expect(res.status).toBe(201);
    expect(res.data.csrfToken).toBeTruthy();
    csrf = String(res.data.csrfToken);
    expect(cookie).toContain('tp_session=');
    expect((res.data.user as { role: string }).role).toBe('owner');
  });

  it('blocks state-changing requests without a CSRF token', async () => {
    const res = await call('/projects', { method: 'POST', body: { name: 'No CSRF', key: 'NC' } });
    expect(res.status).toBe(403);
  });

  it('creates a project with a valid CSRF token', async () => {
    const res = await call('/projects', { method: 'POST', useCsrf: true, body: { name: 'Integration Project', key: 'INT', baseUrl: base, allowedHosts: ['127.0.0.1'] } });
    expect(res.status).toBe(201);
    projectId = String(res.data.id);
    expect(projectId).toBeTruthy();
  });

  it('creates a suite and a unit case', async () => {
    const suite = await call('/suites', { method: 'POST', useCsrf: true, body: { projectId, name: 'Unit suite', type: 'unit' } });
    expect(suite.status).toBe(201);
    suiteId = String(suite.data.id);
    const created = await call('/cases', {
      method: 'POST',
      useCsrf: true,
      body: { suiteId, title: 'Adds numbers correctly', type: 'unit', priority: 'critical', code: 'expect(2+2).toBe(4);' },
    });
    expect(created.status).toBe(201);
    caseId = String(created.data.id);
  });

  it('executes a real run and returns passed evidence', async () => {
    const start = await call('/runs', { method: 'POST', useCsrf: true, body: { projectId, suiteId, caseIds: [caseId] } });
    expect(start.status).toBe(202);
    const runId = String(start.data.id);
    let run: Record<string, unknown> | null = null;
    for (let i = 0; i < 40; i += 1) {
      const res = await call(`/runs/${runId}`);
      run = res.data;
      if (run.finishedAt) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(run).toBeTruthy();
    expect(run!.status).toBe('passed');
    const results = run!.results as Array<{ status: string; message?: string }>;
    expect(results[0].status).toBe('passed');
    expect(results[0].message).toContain('assertion');
  });

  it('computes dashboard metrics from real executions', async () => {
    const res = await call('/dashboard');
    expect(res.status).toBe(200);
    expect(res.data.cases).toBe(1);
    expect(res.data.passed ?? res.data.executed).toBeTruthy();
    const trend = res.data.trend as Array<{ passRate: number }>;
    expect(trend.length).toBeGreaterThan(0);
    expect(trend[0].passRate).toBe(100);
  });

  it('generates and approves AI cases through the approval gate', async () => {
    const gen = await call('/ai/generate-cases', {
      method: 'POST',
      useCsrf: true,
      body: { requirement: 'Users can reset their password with a time-limited email token.', count: 4, suiteId, requestApproval: true },
    });
    expect(gen.status).toBe(200);
    expect((gen.data.cases as unknown[]).length).toBe(4);
    const approvalId = String(gen.data.approvalId);
    expect(approvalId).not.toBe('undefined');
    const decision = await call(`/ai/approvals/${approvalId}`, { method: 'POST', useCsrf: true, body: { decision: 'approved' } });
    expect(decision.status).toBe(200);
    expect(decision.data.applied).toBe(4);
  });

  it('produces JSON and HTML report exports', async () => {
    const created = await call('/reports/generate', { method: 'POST', useCsrf: true, body: { projectId, kind: 'quality' } });
    expect(created.status).toBe(201);
    const id = String(created.data.id);
    const json = await call(`/reports/${id}/export?format=json`);
    expect(json.status).toBe(200);
    const html = await call(`/reports/${id}/export?format=html`);
    expect(html.status).toBe(200);
    expect(html.text).toContain('TESTPILOT AI');
    expect(html.text).toContain('<html');
  });

  it('enforces role-based access control for viewers', async () => {
    const invite = await call('/workspace/members', {
      method: 'POST',
      useCsrf: true,
      body: { name: 'Read Only', email: 'viewer@test.local', role: 'viewer', password: 'V1ewerPass!' },
    });
    expect(invite.status).toBe(201);
    const ownerCookie = cookie;
    cookie = '';
    const login = await call('/auth/login', { method: 'POST', body: { email: 'viewer@test.local', password: 'V1ewerPass!' } });
    expect(login.status).toBe(200);
    csrf = String(login.data.csrfToken);
    const forbidden = await call('/projects', { method: 'POST', useCsrf: true, body: { name: 'Nope', key: 'NO' } });
    expect(forbidden.status).toBe(403);
    // restore owner
    cookie = ownerCookie;
    const me = await call('/auth/me');
    expect(me.status).toBe(200);
    csrf = String(me.data.csrfToken);
  });

  it('validates login credentials', async () => {
    const bad = await call('/auth/login', { method: 'POST', body: { email: 'owner@test.local', password: 'wrong-password' } });
    expect(bad.status).toBe(401);
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const res = await call('/definitely-not-real');
    expect(res.status).toBe(404);
    expect(res.data.error).toBeTruthy();
  });
});
