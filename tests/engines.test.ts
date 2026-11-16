import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { analyseAccessibility, analyseSecurityHeaders, runApiCase, runDatabaseCase, runLoadTest, runUnitCase, runVisualCase } from '../server/engine/runners';
import { assertSafeUrl, hashPassword, verifyPassword, RateLimiter } from '../server/security';

describe('sandboxed unit runner', () => {
  it('passes genuine assertions', () => {
    const out = runUnitCase(
      `function sum(a,b){return a+b;}\nexpect(sum(2,3)).toBe(5);\ntest('handles negatives', () => { expect(sum(-2,1)).toBe(-1); });`,
      2000,
    );
    expect(out.status).toBe('passed');
    expect(out.details?.assertions).toBe(2);
  });

  it('reports assertion failures with evidence', () => {
    const out = runUnitCase(`expect(1).toBe(2);`, 2000);
    expect(out.status).toBe('failed');
    expect(out.message).toContain('Expected 2');
  });

  it('isolates the sandbox from require/process', () => {
    const out = runUnitCase(`expect(typeof require).toBe('undefined'); expect(typeof process).toBe('undefined');`, 2000);
    expect(out.status).toBe('passed');
  });

  it('stops runaway synchronous code', () => {
    const out = runUnitCase(`while (true) {}`, 300);
    expect(out.status).toBe('error');
    expect(out.message).toMatch(/exceeded|timed out/i);
  });

  it('skips empty definitions', () => {
    expect(runUnitCase('', 1000).status).toBe('skipped');
  });
});

describe('accessibility static analysis', () => {
  it('scores a clean document highly', () => {
    const html = `<html lang="en"><body><nav></nav><main><h1>Title</h1><img src="a.png" alt="A"><a href="/x">Go</a><button>Save</button></main></body></html>`;
    const { score, findings } = analyseAccessibility(html);
    expect(score).toBeGreaterThanOrEqual(90);
    expect(findings.find((f) => f.rule === 'image-alt')).toBeUndefined();
  });

  it('flags missing alt text, labels and lang', () => {
    const html = `<html><body><img src="a.png"><input id="x"><h1>One</h1><h1>Two</h1></body></html>`;
    const { score, findings } = analyseAccessibility(html);
    expect(findings.map((f) => f.rule)).toEqual(expect.arrayContaining(['image-alt', 'html-lang', 'single-h1', 'landmark-main']));
    expect(score).toBeLessThan(70);
  });
});

describe('security header analysis', () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it('rewards a hardened response', () => {
    const { score, findings } = analyseSecurityHeaders('https://example.com', headers({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'content-security-policy': "default-src 'self'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=()',
      'x-frame-options': 'DENY',
    }));
    expect(score).toBe(100);
    expect(findings).toHaveLength(0);
  });

  it('detects plaintext HTTP and missing headers', () => {
    const { score, findings } = analyseSecurityHeaders('http://example.com', headers({ 'access-control-allow-origin': '*' }));
    expect(score).toBeLessThan(50);
    expect(findings.map((f) => f.title)).toEqual(expect.arrayContaining(['HTTPS not enforced', 'Missing HSTS', 'Wildcard CORS']));
  });
});

describe('database fixture integrity', () => {
  it('passes valid referential data', () => {
    const out = runDatabaseCase(
      [
        { table: 'customers', rows: [{ id: 1 }] },
        { table: 'orders', rows: [{ id: 10, customer_id: 1 }] },
      ],
      { foreignKeys: [{ table: 'orders', field: 'customer_id', references: { table: 'customers', field: 'id' } }], minRows: { orders: 1 } },
    );
    expect(out.status).toBe('passed');
  });

  it('detects orphan rows and duplicates', () => {
    const out = runDatabaseCase(
      [{ table: 'orders', rows: [{ id: 1, customer_id: 9 }, { id: 1, customer_id: 9 }] }],
      { unique: [{ table: 'orders', field: 'id' }], foreignKeys: [{ table: 'orders', field: 'customer_id', references: { table: 'customers', field: 'id' } }] },
    );
    expect(out.status).toBe('failed');
    expect(out.evidence).toContain('duplicate');
  });
});

describe('URL safety', () => {
  it('rejects cloud metadata endpoints', () => {
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow();
  });
  it('rejects non-http schemes', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow();
  });
  it('enforces allowlists', () => {
    expect(() => assertSafeUrl('https://evil-example.com', ['example.com'])).toThrow();
    expect(assertSafeUrl('https://api.example.com/x', ['example.com']).hostname).toBe('api.example.com');
  });
});

describe('password hashing and rate limiting', () => {
  it('hashes with scrypt and verifies', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('blocks after the limit', () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.consume('a').ok).toBe(true);
    expect(limiter.consume('a').ok).toBe(true);
    expect(limiter.consume('a').ok).toBe(false);
  });
});

/* Live HTTP integration: local server only. */
describe('HTTP engines against a local server', () => {
  let server: http.Server;
  let base = '';

  beforeEach(async () => {
    if (server) return;
    server = http.createServer((req, res) => {
      if (req.url === '/json') {
        res.writeHead(200, { 'content-type': 'application/json', 'strict-transport-security': 'max-age=31536000' });
        res.end(JSON.stringify({ ok: true, items: [{ id: 7 }] }));
      } else if (req.url === '/slow') {
        setTimeout(() => { res.writeHead(200); res.end('slow'); }, 120);
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('validates status, JSON path and headers', async () => {
    const out = await runApiCase(
      {
        method: 'GET',
        url: `${base}/json`,
        assertions: { status: 200, jsonPath: { path: 'items[0].id', equals: 7 }, header: { name: 'content-type', includes: 'application/json' } },
      },
      ['127.0.0.1'],
      5000,
    );
    expect(out.status).toBe('passed');
  });

  it('fails when an assertion is wrong', async () => {
    const out = await runApiCase({ method: 'GET', url: `${base}/json`, assertions: { status: 201 } }, ['127.0.0.1'], 5000);
    expect(out.status).toBe('failed');
  });

  it('captures a visual baseline then detects a change', async () => {
    const first = await runVisualCase(`${base}/json`, ['127.0.0.1'], undefined, 5000);
    expect(first.details?.baseline).toBe(true);
    const same = await runVisualCase(`${base}/json`, ['127.0.0.1'], String(first.details?.hash), 5000);
    expect(same.status).toBe('passed');
    const changed = await runVisualCase(`${base}/missing`, ['127.0.0.1'], String(first.details?.hash), 5000);
    expect(changed.status).toBe('failed');
  });

  it('measures a bounded load profile', async () => {
    const { metrics, samples } = await runLoadTest(`${base}/json`, ['127.0.0.1'], 12, 3);
    expect(samples).toHaveLength(12);
    expect(metrics.p95).toBeGreaterThanOrEqual(0);
    expect(metrics.errors).toBe(0);
    expect(metrics.rps).toBeGreaterThan(0);
  });

  it('refuses targets outside the allowlist', async () => {
    const out = await runApiCase({ method: 'GET', url: `${base}/json` }, ['example.com'], 3000);
    expect(out.status).toBe('error');
    expect(out.message).toMatch(/not in this project/);
  });
});
