import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BENCHMARK_SUITES,
  configHash,
  currentTarget,
  median,
  parseTriageBuckets,
  percentile,
  precisionRecallF1,
  runAllSuites,
} from '../server/ai/benchmarks.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testpilot-bench-'));
process.env.TESTPILOT_DATA_DIR = dataDir;
process.env.TESTPILOT_SEED = '0';
process.env.VITEST = 'true';

let server: Server;
let base = '';
let cookie = '';
let csrf = '';

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

describe('benchmark metric helpers', () => {
  it('computes precision, recall and F1 correctly', () => {
    expect(precisionRecallF1(8, 0, 0)).toEqual({ precision: 1, recall: 1, f1: 1 });
    const half = precisionRecallF1(4, 4, 4);
    expect(half.precision).toBeCloseTo(0.5);
    expect(half.recall).toBeCloseTo(0.5);
    expect(half.f1).toBeCloseTo(0.5);
    // precision 0.75, recall 0.6 → f1 ≈ 0.667
    const mixed = precisionRecallF1(6, 2, 4);
    expect(mixed.precision).toBeCloseTo(0.75);
    expect(mixed.recall).toBeCloseTo(0.6);
    expect(mixed.f1).toBeCloseTo(2 / 3, 2);
    // degenerate: no predictions and no ground truth → defined zeros, not NaN
    expect(precisionRecallF1(0, 0, 0)).toEqual({ precision: 0, recall: 0, f1: 0 });
  });

  it('computes median and nearest-rank percentiles', () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([4, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
  });
});

describe('benchmark engine (direct)', () => {
  it('exposes seven registered suites', () => {
    expect(BENCHMARK_SUITES).toHaveLength(7);
    expect(new Set(BENCHMARK_SUITES.map((s) => s.id)).size).toBe(7);
  });

  it('runs all suites against the local target with real measurements', async () => {
    const target = currentTarget();
    expect(target.kind).toBe('local');
    expect(target.available).toBe(true);
    const result = await runAllSuites(target);
    expect(result.suites).toHaveLength(7);
    for (const suite of result.suites) {
      expect(suite.errors).toBe(0);
      expect(suite.cases.length).toBeGreaterThan(0);
      expect(suite.latency.samples).toBeGreaterThan(0);
      for (const c of suite.cases) expect(typeof c.passed).toBe('boolean');
    }
    // The deterministic local provider must pass every fixture after the
    // recommendation-line hardening (verified weakness fix).
    expect(result.overall.passRate).toBe(100);
    expect(result.overall.hallucinationRate).toBe(0);
    expect(result.overall.errorRate).toBe(0);
  }, 30000);

  it('produces a stable config hash for the same target', () => {
    const t = currentTarget();
    expect(configHash(t)).toBe(configHash(currentTarget()));
  });

  it('parses triage buckets without counting indented recommendation lines as titles', () => {
    const sample = [
      '**Timeout / slow dependency** — 1 failure(s)',
      '- Login under load: timed out',
      '  ↳ Recommended: raise the per-case timeout',
    ].join('\n');
    const parsed = parseTriageBuckets(sample);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].titles).toEqual(['Login under load']);
  });
});

describe('benchmark API', () => {
  let runA = '';
  let runB = '';

  it('registers an owner account', async () => {
    const reg = await call('/auth/register', {
      method: 'POST',
      body: { name: 'Bench Owner', email: 'bench@test.local', password: 'Str0ngPass!', workspaceName: 'Bench Lab' },
    });
    expect(reg.status).toBe(201);
    csrf = String(reg.data.csrfToken);
  });

  it('lists suite definitions', async () => {
    const res = await call('/ai/benchmarks/suites');
    expect(res.status).toBe(200);
    expect((res.data as unknown as Array<{ id: string }>)).toHaveLength(7);
  });

  it('runs a full benchmark through the API', async () => {
    const res = await call('/ai/benchmarks/run', { method: 'POST', useCsrf: true, body: { label: 'baseline' } });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe('completed');
    expect((res.data.overall as Record<string, number>).passRate).toBe(100);
    expect((res.data.suites as unknown[]).length).toBe(7);
    runA = String(res.data.id);
  }, 30000);

  it('appends a second run and preserves the first record untouched', async () => {
    const before = await call(`/ai/benchmarks/runs/${runA}`);
    const res = await call('/ai/benchmarks/run', { method: 'POST', useCsrf: true, body: { label: 'after fix' } });
    expect(res.status).toBe(201);
    runB = String(res.data.id);
    expect(runB).not.toBe(runA);
    const after = await call(`/ai/benchmarks/runs/${runA}`);
    expect(after.data).toEqual(before.data);
    const history = await call('/ai/benchmarks/runs');
    expect(history.data.total).toBe(2);
  }, 30000);

  it('compares two runs with the same config hash and reports deltas', async () => {
    const res = await call('/ai/benchmarks/compare', { method: 'POST', useCsrf: true, body: { a: runA, b: runB } });
    expect(res.status).toBe(200);
    expect(res.data.regression).toBe(false);
    const overall = res.data.overall as Record<string, { delta: number }>;
    expect(overall.passRate.delta).toBe(0);
  });

  it('rejects comparison across different configurations', async () => {
    const res = await call('/ai/benchmarks/compare', { method: 'POST', useCsrf: true, body: { a: runA, b: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('exports JSON and CSV', async () => {
    const json = await call(`/ai/benchmarks/runs/${runA}/export?format=json`);
    expect(json.status).toBe(200);
    expect(json.data.id).toBe(runA);
    const csv = await call(`/ai/benchmarks/runs/${runA}/export?format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.text.split('\n')[0]).toContain('suite_id,metric,value');
    expect(csv.text.split('\n').length).toBeGreaterThan(7);
  });

  it('computes the leaderboard and refuses to declare a winner with one target', async () => {
    const res = await call('/ai/benchmarks/leaderboard');
    expect(res.status).toBe(200);
    expect((res.data.entries as unknown[]).length).toBe(1);
    expect(res.data.winnerDeclared).toBe(false);
    expect(String(res.data.note)).toContain('no overall winner');
  });

  it('blocks viewers from running benchmarks', async () => {
    const invite = await call('/workspace/members', {
      method: 'POST',
      useCsrf: true,
      body: { name: 'Read Only', email: 'bench-viewer@test.local', role: 'viewer', password: 'V1ewerPass!' },
    });
    expect(invite.status).toBe(201);
    const ownerCookie = cookie;
    cookie = '';
    const login = await call('/auth/login', { method: 'POST', body: { email: 'bench-viewer@test.local', password: 'V1ewerPass!' } });
    expect(login.status).toBe(200);
    csrf = String(login.data.csrfToken);
    const denied = await call('/ai/benchmarks/run', { method: 'POST', useCsrf: true, body: {} });
    expect(denied.status).toBe(403);
    // viewers can still read suites/history
    expect((await call('/ai/benchmarks/suites')).status).toBe(200);
    expect((await call('/ai/benchmarks/runs')).status).toBe(200);
    cookie = ownerCookie;
    const me = await call('/auth/me');
    csrf = String(me.data.csrfToken);
  });
});
