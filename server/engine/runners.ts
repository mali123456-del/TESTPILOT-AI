import vm from 'node:vm';
import crypto from 'node:crypto';
import type {
  ApiRequestSpec,
  ApiResponseResult,
  PerfRun,
  ResultStatus,
  SecurityFinding,
  TestCase,
} from '../../shared/types.js';
import { assertSafeUrl } from '../security.js';

export interface EngineOutcome {
  status: ResultStatus;
  message?: string;
  evidence?: string;
  details?: Record<string, unknown>;
}

const MAX_BODY = 2_000_000;

/* ------------------------------------------------------------------ unit */
const HARNESS = `
var __results = [];
var __assertions = 0;
var __topLevelError = null;
function __fail(msg) { throw new Error(msg); }
function __eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function expect(actual) {
  return {
    toBe(e) { __assertions++; if (!Object.is(actual, e)) __fail('Expected ' + JSON.stringify(e) + ' but received ' + JSON.stringify(actual)); },
    toEqual(e) { __assertions++; if (!__eq(actual, e)) __fail('Expected ' + JSON.stringify(e) + ' but received ' + JSON.stringify(actual)); },
    toBeTruthy() { __assertions++; if (!actual) __fail('Expected truthy but received ' + String(actual)); },
    toBeFalsy() { __assertions++; if (actual) __fail('Expected falsy but received ' + String(actual)); },
    toBeGreaterThan(e) { __assertions++; if (!(actual > e)) __fail('Expected > ' + e + ' but received ' + String(actual)); },
    toBeLessThan(e) { __assertions++; if (!(actual < e)) __fail('Expected < ' + e + ' but received ' + String(actual)); },
    toContain(e) { __assertions++; if (String(actual).indexOf(e) === -1) __fail('Expected to contain ' + JSON.stringify(e)); },
    toHaveLength(n) { __assertions++; if (!actual || actual.length !== n) __fail('Expected length ' + n + ' but received ' + (actual && actual.length)); },
    toMatch(re) { __assertions++; if (!new RegExp(re).test(String(actual))) __fail('Expected to match ' + re); },
    toThrow() { __assertions++; var threw = false; try { actual(); } catch (e) { threw = true; } if (!threw) __fail('Expected function to throw'); },
    toBeCloseTo(e, d) { __assertions++; if (Math.abs(actual - e) > (d === undefined ? 1e-9 : d)) __fail('Expected ~' + e + ' but received ' + actual); }
  };
}
function test(name, fn) {
  try {
    var out = fn();
    if (out && typeof out.then === 'function') throw new Error('Async test functions are not supported in the sandboxed unit runner');
    __results.push({ name: String(name), ok: true });
  } catch (e) {
    __results.push({ name: String(name), ok: false, error: (e && e.message) ? e.message : String(e) });
  }
}
`;

export function runUnitCase(code: string, timeoutMs: number): EngineOutcome {
  if (!code || !code.trim()) return { status: 'skipped', message: 'No test code supplied' };
  const logs: string[] = [];
  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => logs.push(args.map((a) => String(a)).join(' ')),
      error: (...args: unknown[]) => logs.push(`error: ${args.map((a) => String(a)).join(' ')}`),
      warn: (...args: unknown[]) => logs.push(`warn: ${args.map((a) => String(a)).join(' ')}`),
    },
    __results: [] as unknown[],
    __assertions: 0,
  };
  const started = Date.now();
  try {
    const script = new vm.Script(`${HARNESS}\ntry {\n${code}\n} catch (__e) { __topLevelError = (__e && __e.message) ? __e.message : String(__e); }\n`, { filename: 'testpilot-unit-case.js' });
    script.runInNewContext(sandbox, { timeout: Math.min(Math.max(timeoutMs, 100), 8000) });
    const topLevelError = typeof sandbox.__topLevelError === 'string' ? sandbox.__topLevelError : null;
    const results = (sandbox.__results as Array<{ name: string; ok: boolean; error?: string }>) ?? [];
    const failures = results.filter((r) => !r.ok);
    const assertions = Number(sandbox.__assertions ?? 0);
    const details = {
      tests: results,
      assertions,
      logs: logs.slice(0, 50),
      durationMs: Date.now() - started,
    };
    if (topLevelError) {
      const assertionFailure = /^Expected /.test(topLevelError);
      return {
        status: assertionFailure ? 'failed' : 'error',
        message: topLevelError,
        evidence: topLevelError,
        details,
      };
    }
    if (results.length === 0 && assertions === 0) {
      return { status: 'skipped', message: 'No assertions executed', details };
    }
    if (failures.length > 0) {
      return {
        status: 'failed',
        message: `${failures.length} of ${results.length} test blocks failed: ${failures[0].error ?? 'assertion failed'}`,
        evidence: failures.map((f) => `${f.name}: ${f.error}`).join('\n'),
        details,
      };
    }
    return {
      status: 'passed',
      message: `${results.length || 1} test block(s), ${assertions} assertion(s) passed`,
      details,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = /timed out/i.test(message);
    return {
      status: 'error',
      message: timedOut ? `Execution exceeded ${Math.min(timeoutMs, 8000)}ms` : message,
      evidence: logs.join('\n').slice(0, 4000),
      details: { durationMs: Date.now() - started },
    };
  }
}

/* ------------------------------------------------------------------- api */
function readPath(value: unknown, path: string): unknown {
  const clean = path.replace(/^\$\.?/, '');
  const parts = clean.split(/[.[\]]+/).filter(Boolean);
  let cur: unknown = value;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

export async function sendApiRequest(
  spec: ApiRequestSpec,
  allowedHosts: string[],
  timeoutMs = 15000,
): Promise<{ result: ApiResponseResult; assertions: Array<{ label: string; ok: boolean }> }> {
  const url = assertSafeUrl(spec.url, allowedHosts);
  if (spec.query) for (const [k, v] of Object.entries(spec.query)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 500), 60000));
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: spec.method,
      headers: { 'user-agent': 'TESTPILOT-AI/1.0 (+https://github.com/mali123456-del/TESTPILOT-AI)', ...spec.headers },
      body: ['GET', 'HEAD'].includes(spec.method) ? undefined : spec.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    const durationMs = Date.now() - started;
    const text = (await res.text()).slice(0, MAX_BODY);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    const result: ApiResponseResult = {
      status: res.status,
      statusText: res.statusText,
      durationMs,
      headers,
      bodySnippet: text.slice(0, 4000),
      size: text.length,
    };
    const a = spec.assertions ?? {};
    const checks: Array<{ label: string; ok: boolean }> = [];
    if (a.status !== undefined) checks.push({ label: `status == ${a.status}`, ok: res.status === a.status });
    if (a.statusIn?.length) checks.push({ label: `status in ${a.statusIn.join(',')}`, ok: a.statusIn.includes(res.status) });
    if (a.maxLatencyMs !== undefined) checks.push({ label: `latency <= ${a.maxLatencyMs}ms`, ok: durationMs <= a.maxLatencyMs });
    if (a.contains) checks.push({ label: `body contains ${JSON.stringify(a.contains)}`, ok: text.includes(a.contains) });
    if (a.header) {
      const value = res.headers.get(a.header.name) ?? '';
      checks.push({ label: `header ${a.header.name} includes ${a.header.includes}`, ok: value.includes(a.header.includes) });
    }
    if (a.jsonPath) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      const got = parsed === undefined ? undefined : readPath(parsed, a.jsonPath.path);
      checks.push({
        label: `${a.jsonPath.path} == ${JSON.stringify(a.jsonPath.equals)}`,
        ok: JSON.stringify(got) === JSON.stringify(a.jsonPath.equals),
      });
    }
    return { result, assertions: checks };
  } finally {
    clearTimeout(timer);
  }
}

export async function runApiCase(spec: ApiRequestSpec | undefined, allowedHosts: string[], timeoutMs: number): Promise<EngineOutcome> {
  if (!spec?.url) return { status: 'skipped', message: 'No request configured' };
  try {
    const { result, assertions } = await sendApiRequest(spec, allowedHosts, timeoutMs);
    const failed = assertions.filter((c) => !c.ok);
    const evidence = `HTTP ${result.status} in ${result.durationMs}ms\n${result.bodySnippet.slice(0, 1200)}`;
    return {
      status: failed.length ? 'failed' : 'passed',
      message: failed.length
        ? `Assertion failed: ${failed.map((c) => c.label).join('; ')}`
        : `HTTP ${result.status} in ${result.durationMs}ms · ${assertions.length} assertion(s) passed`,
      evidence,
      details: { assertions, status: result.status, durationMs: result.durationMs, size: result.size },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', message: /abort/i.test(message) ? 'Request timed out' : message };
  }
}

/* ------------------------------------------------------------ html utils */
export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url: string, allowedHosts: string[], timeoutMs = 15000): Promise<{ html: string; status: number; headers: Headers }> {
  const safe = assertSafeUrl(url, allowedHosts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 30000));
  try {
    const res = await fetch(safe, { signal: controller.signal, headers: { accept: 'text/html,*/*' } });
    const html = (await res.text()).slice(0, MAX_BODY);
    return { html, status: res.status, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------------------------------------- accessibility */
export function analyseAccessibility(html: string): { score: number; findings: Array<{ rule: string; impact: 'minor' | 'moderate' | 'serious' | 'critical'; count: number; detail: string }> } {
  const findings: Array<{ rule: string; impact: 'minor' | 'moderate' | 'serious' | 'critical'; count: number; detail: string }> = [];
  const count = (re: RegExp) => (html.match(re) ?? []).length;

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const imgsNoAlt = imgs.filter((tag) => !/\balt\s*=/.test(tag)).length;
  if (imgsNoAlt) findings.push({ rule: 'image-alt', impact: 'critical', count: imgsNoAlt, detail: 'Images without an alt attribute' });

  const inputs = html.match(/<(input|select|textarea)\b[^>]*>/gi) ?? [];
  const unlabeled = inputs.filter((tag) => !/aria-label|aria-labelledby|\bid\s*=|type\s*=\s*["'](hidden|submit|button|reset)["']/i.test(tag)).length;
  if (unlabeled) findings.push({ rule: 'form-label', impact: 'serious', count: unlabeled, detail: 'Form controls with no id/aria label to associate a label' });

  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
  const emptyButtons = buttons.filter((b) => !/aria-label|aria-labelledby/.test(b) && stripTags(b).length === 0).length;
  if (emptyButtons) findings.push({ rule: 'button-name', impact: 'serious', count: emptyButtons, detail: 'Icon buttons without an accessible name' });

  if (!/<html\b[^>]*\blang\s*=/i.test(html)) findings.push({ rule: 'html-lang', impact: 'serious', count: 1, detail: 'Root <html> element has no lang attribute' });

  const h1s = count(/<h1\b/gi);
  if (h1s === 0) findings.push({ rule: 'page-h1', impact: 'moderate', count: 1, detail: 'Page has no <h1>' });
  else if (h1s > 1) findings.push({ rule: 'single-h1', impact: 'minor', count: h1s - 1, detail: 'Multiple <h1> elements on a page' });

  const links = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const emptyLinks = links.filter((l) => !/aria-label|title=/.test(l) && stripTags(l).length === 0).length;
  if (emptyLinks) findings.push({ rule: 'link-name', impact: 'serious', count: emptyLinks, detail: 'Links without discernible text' });

  const positiveTab = [...html.matchAll(/tabindex\s*=\s*["']?([1-9]\d*)/gi)].length;
  if (positiveTab) findings.push({ rule: 'tabindex', impact: 'moderate', count: positiveTab, detail: 'Positive tabindex disrupts natural focus order' });

  const iframes = (html.match(/<iframe\b[^>]*>/gi) ?? []).filter((f) => !/\btitle\s*=/.test(f)).length;
  if (iframes) findings.push({ rule: 'frame-title', impact: 'serious', count: iframes, detail: 'Iframes without a title attribute' });

  if (!/<main\b/i.test(html)) findings.push({ rule: 'landmark-main', impact: 'minor', count: 1, detail: 'No <main> landmark' });
  if (!/<nav\b/i.test(html)) findings.push({ rule: 'landmark-nav', impact: 'minor', count: 1, detail: 'No <nav> landmark' });

  const weights = { minor: 2, moderate: 5, serious: 10, critical: 15 } as const;
  const penalty = findings.reduce((sum, f) => sum + weights[f.impact] * Math.min(f.count, 4), 0);
  return { score: Math.max(0, 100 - penalty), findings };
}

export async function runAccessibility(url: string, allowedHosts: string[], timeoutMs: number): Promise<EngineOutcome> {
  if (!url) return { status: 'skipped', message: 'No target URL configured' };
  try {
    const { html } = await fetchHtml(url, allowedHosts, timeoutMs);
    const { score, findings } = analyseAccessibility(html);
    if (!html.trim()) return { status: 'error', message: 'Target returned an empty document' };
    return {
      status: score >= 80 ? 'passed' : 'failed',
      message: `Accessibility score ${score}/100 · ${findings.length} rule group(s) triggered`,
      evidence: findings.map((f) => `${f.rule} (${f.impact}) x${f.count}: ${f.detail}`).join('\n') || 'No static accessibility issues detected',
      details: { score, findings },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/* --------------------------------------------------------------- visual */
function normalizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function runVisualCase(
  url: string,
  allowedHosts: string[],
  baselineHash: string | undefined,
  timeoutMs: number,
): Promise<EngineOutcome> {
  if (!url) return { status: 'skipped', message: 'No target URL configured' };
  try {
    const { html } = await fetchHtml(url, allowedHosts, timeoutMs);
    const normalized = normalizeHtml(html);
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    if (!baselineHash) {
      return {
        status: 'passed',
        message: 'Baseline captured (DOM snapshot). Re-run to detect visual/content regressions.',
        details: { hash, baseline: true },
      };
    }
    if (hash === baselineHash) return { status: 'passed', message: `DOM fingerprint unchanged (${hash.slice(0, 12)})`, details: { hash, baseline: false } };
    return {
      status: 'failed',
      message: 'DOM fingerprint changed since baseline',
      evidence: `baseline ${baselineHash.slice(0, 12)} → current ${hash.slice(0, 12)}`,
      details: { hash, baselineHash, baseline: false },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/* -------------------------------------------------------------- database */
export interface DataFixture {
  table: string;
  rows: Array<Record<string, unknown>>;
}
export interface DataRules {
  unique?: Array<{ table: string; field: string }>;
  required?: Array<{ table: string; field: string }>;
  foreignKeys?: Array<{ table: string; field: string; references: { table: string; field: string } }>;
  minRows?: Record<string, number>;
}

export function runDatabaseCase(fixture: unknown, rules: DataRules | undefined): EngineOutcome {
  const tables = fixture as DataFixture[] | undefined;
  if (!Array.isArray(tables) || tables.length === 0) return { status: 'skipped', message: 'No dataset fixture supplied' };
  const problems: string[] = [];
  const map = new Map(tables.map((t) => [t.table, t.rows]));
  for (const t of tables) {
    if (!Array.isArray(t.rows)) problems.push(`Table ${t.table} has no rows array`);
  }
  for (const [table, min] of Object.entries(rules?.minRows ?? {})) {
    const rows = map.get(table);
    if (!rows || rows.length < min) problems.push(`${table}: expected at least ${min} rows, found ${rows?.length ?? 0}`);
  }
  for (const rule of rules?.required ?? []) {
    for (const row of map.get(rule.table) ?? []) {
      if (row[rule.field] === undefined || row[rule.field] === null || row[rule.field] === '') problems.push(`${rule.table}.${rule.field} missing on a row`);
    }
  }
  for (const rule of rules?.unique ?? []) {
    const seen = new Set<unknown>();
    for (const row of map.get(rule.table) ?? []) {
      const v = row[rule.field];
      if (seen.has(v)) problems.push(`${rule.table}.${rule.field} duplicate value ${JSON.stringify(v)}`);
      seen.add(v);
    }
  }
  for (const fk of rules?.foreignKeys ?? []) {
    const targets = new Set((map.get(fk.references.table) ?? []).map((r) => r[fk.references.field]));
    for (const row of map.get(fk.table) ?? []) {
      const v = row[fk.field];
      if (v !== null && v !== undefined && !targets.has(v)) problems.push(`${fk.table}.${fk.field}=${JSON.stringify(v)} has no parent in ${fk.references.table}`);
    }
  }
  const total = tables.reduce((n, t) => n + t.rows.length, 0);
  return {
    status: problems.length ? 'failed' : 'passed',
    message: problems.length
      ? `${problems.length} integrity problem(s) across ${total} rows`
      : `Validated ${total} rows across ${tables.length} tables`,
    evidence: problems.slice(0, 40).join('\n'),
    details: { tables: tables.length, rows: total, problems: problems.length },
  };
}

/* ----------------------------------------------------------- performance */
export async function runLoadTest(
  url: string,
  allowedHosts: string[],
  requests: number,
  concurrency: number,
): Promise<{ metrics: NonNullable<PerfRun['metrics']>; samples: number[] }> {
  const safe = assertSafeUrl(url, allowedHosts);
  const total = Math.min(Math.max(requests, 1), 200);
  const workers = Math.min(Math.max(concurrency, 1), 20);
  const latencies: number[] = [];
  let errors = 0;
  let assigned = 0;
  const started = Date.now();
  const worker = async () => {
    while (assigned < total) {
      assigned += 1;
      const t0 = Date.now();
      try {
        const res = await fetch(safe, { method: 'GET', signal: AbortSignal.timeout(15000) });
        await res.arrayBuffer();
        if (!res.ok) errors += 1;
        latencies.push(Date.now() - t0);
      } catch {
        errors += 1;
        latencies.push(Date.now() - t0);
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  const elapsed = Math.max(Date.now() - started, 1);
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    metrics: {
      rps: Number((sorted.length / (elapsed / 1000)).toFixed(2)),
      p50: pct(50),
      p95: pct(95),
      p99: pct(99),
      avg: Number((sum / Math.max(sorted.length, 1)).toFixed(1)),
      max: sorted[sorted.length - 1] ?? 0,
      min: sorted[0] ?? 0,
      errors,
      errorRate: Number(((errors / Math.max(sorted.length, 1)) * 100).toFixed(2)),
    },
    samples: sorted,
  };
}

/* -------------------------------------------------------------- security */
export function analyseSecurityHeaders(url: string, headers: Headers): { score: number; findings: SecurityFinding[] } {
  const findings: SecurityFinding[] = [];
  const mk = (
    title: string,
    severity: SecurityFinding['severity'],
    description: string,
    remediation: string,
    evidence?: string,
  ): SecurityFinding => ({ id: crypto.randomUUID(), title, severity, description, remediation, evidence });
  const proto = new URL(url).protocol;

  if (proto !== 'https:') {
    findings.push(mk('HTTPS not enforced', 'high', 'The scanned endpoint is served over plain HTTP.', 'Serve all traffic over HTTPS with an automatic redirect.', url));
  }
  const hsts = headers.get('strict-transport-security');
  if (!hsts) findings.push(mk('Missing HSTS', 'medium', 'Strict-Transport-Security is absent, allowing protocol downgrade.', 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains.', 'header absent'));
  else if (!/max-age=(\d+)/i.test(hsts) || Number(/max-age=(\d+)/i.exec(hsts)?.[1]) < 15552000) {
    findings.push(mk('HSTS max-age too low', 'low', 'HSTS max-age is under 180 days.', 'Raise max-age to at least 15552000.', hsts));
  }
  const csp = headers.get('content-security-policy');
  if (!csp) findings.push(mk('Missing CSP', 'medium', 'No Content-Security-Policy header.', 'Define a restrictive CSP without unsafe-inline/unsafe-eval.', 'header absent'));
  else if (/unsafe-eval/i.test(csp)) findings.push(mk('CSP allows unsafe-eval', 'medium', 'unsafe-eval weakens XSS protections.', 'Remove unsafe-eval from script-src.', csp));
  if (!headers.get('x-content-type-options')) findings.push(mk('Missing X-Content-Type-Options', 'low', 'Browsers may MIME-sniff responses.', 'Set X-Content-Type-Options: nosniff.', 'header absent'));
  if (!headers.get('referrer-policy')) findings.push(mk('Missing Referrer-Policy', 'low', 'Referrer leakage to third parties is possible.', 'Set Referrer-Policy: strict-origin-when-cross-origin.', 'header absent'));
  if (!headers.get('permissions-policy')) findings.push(mk('Missing Permissions-Policy', 'info', 'Sensitive browser features are not restricted.', 'Disable unused features (camera, microphone, geolocation).', 'header absent'));
  const xfo = headers.get('x-frame-options');
  if (!xfo && !/frame-ancestors/i.test(csp ?? '')) findings.push(mk('Clickjacking protection missing', 'medium', 'Neither X-Frame-Options nor CSP frame-ancestors is set.', 'Set X-Frame-Options: DENY or CSP frame-ancestors \'none\'.', 'header absent'));
  const cors = headers.get('access-control-allow-origin');
  if (cors === '*') findings.push(mk('Wildcard CORS', 'medium', 'Access-Control-Allow-Origin is * on a scanned endpoint.', 'Restrict CORS to trusted origins.', cors));
  const server = headers.get('server');
  if (server && /\d/.test(server)) findings.push(mk('Server version disclosed', 'info', 'The Server header reveals software versions.', 'Remove or genericise the Server header.', server));
  const cookies = headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    const name = cookie.split('=')[0];
    if (!/;\s*secure/i.test(cookie)) findings.push(mk(`Cookie ${name} without Secure`, 'medium', 'Cookie can be transmitted over plaintext HTTP.', 'Add the Secure attribute.', cookie.slice(0, 120)));
    if (!/;\s*httponly/i.test(cookie)) findings.push(mk(`Cookie ${name} without HttpOnly`, 'medium', 'Cookie is readable by JavaScript.', 'Add the HttpOnly attribute.', cookie.slice(0, 120)));
    if (!/;\s*samesite/i.test(cookie)) findings.push(mk(`Cookie ${name} without SameSite`, 'low', 'CSRF exposure may exist.', 'Add SameSite=Lax or Strict.', cookie.slice(0, 120)));
  }

  const weights = { info: 1, low: 4, medium: 9, high: 18, critical: 30 } as const;
  const penalty = findings.reduce((sum, f) => sum + weights[f.severity], 0);
  return { score: Math.max(0, 100 - penalty), findings };
}

export async function runSecurityScan(url: string, allowedHosts: string[], timeoutMs: number): Promise<{ score: number; findings: SecurityFinding[] }> {
  const safe = assertSafeUrl(url, allowedHosts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 30000));
  try {
    const res = await fetch(safe, { signal: controller.signal, redirect: 'follow' });
    await res.arrayBuffer();
    return analyseSecurityHeaders(res.url || safe.href, res.headers);
  } finally {
    clearTimeout(timer);
  }
}

export function caseTarget(testCase: TestCase, baseUrl?: string): string {
  return testCase.targetUrl || testCase.request?.url || baseUrl || '';
}
