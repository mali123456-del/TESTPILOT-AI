import crypto from 'node:crypto';
import type { DataFixture } from './engine/runners.js';
import type {
  ApiCollection,
  Bug,
  Integration,
  Project,
  Run,
  Schedule,
  TestCase,
  TestSuite,
  TestType,
  Workflow,
  Workspace,
} from '../shared/types.js';
import { getDb, id, now, saveDb } from './store.js';
import { hashPassword } from './security.js';

const SELF_URL = process.env.TESTPILOT_SELF_URL ?? 'http://127.0.0.1:4317';
const API_SELF = process.env.TESTPILOT_API_SELF_URL ?? 'http://127.0.0.1:4318';

let seedNum = 42;
const rand = () => {
  seedNum = (seedNum * 1103515245 + 12345) % 2147483648;
  return seedNum / 2147483648;
};

function daysAgo(days: number, hourOffset = 0): string {
  return new Date(Date.now() - days * 86_400_000 + hourOffset * 3_600_000).toISOString();
}

export function isSeeded(): boolean {
  return getDb().users.length > 0;
}

export function seedDemo(): void {
  const db = getDb();
  const workspace: Workspace = {
    id: 'ws_demo',
    name: 'Aurora Labs',
    slug: 'aurora-labs',
    plan: 'pro',
    ownerId: 'usr_owner',
    aiApprovalsRequired: true,
    allowedHosts: ['127.0.0.1', 'localhost', 'example.com'],
    createdAt: daysAgo(64),
  };
  db.workspaces.push(workspace);

  const passwordHash = hashPassword('Demo1234!');
  db.users.push(
    { id: 'usr_owner', workspaceId: workspace.id, email: 'demo@testpilot.ai', name: 'Ava Rahman', role: 'owner', passwordHash, createdAt: daysAgo(64), mustChangePassword: true },
    { id: 'usr_lead', workspaceId: workspace.id, email: 'lead@testpilot.ai', name: 'Noah Kim', role: 'qa_lead', passwordHash, createdAt: daysAgo(48), mustChangePassword: true },
    { id: 'usr_tester', workspaceId: workspace.id, email: 'tester@testpilot.ai', name: 'Mila Ortega', role: 'tester', passwordHash, createdAt: daysAgo(32), mustChangePassword: true },
    { id: 'usr_viewer', workspaceId: workspace.id, email: 'viewer@testpilot.ai', name: 'Sam Idris', role: 'viewer', passwordHash, createdAt: daysAgo(12), mustChangePassword: true },
  );

  const projects: Project[] = [
    {
      id: 'prj_orbit',
      workspaceId: workspace.id,
      name: 'Orbit Commerce',
      key: 'ORB',
      description: 'Headless storefront and checkout experience for the Orbit retail brand.',
      repoUrl: 'https://github.com/mali123456-del/TESTPILOT-AI',
      baseUrl: SELF_URL,
      environment: 'staging',
      allowedHosts: ['127.0.0.1', 'localhost'],
      createdAt: daysAgo(60),
    },
    {
      id: 'prj_pay',
      workspaceId: workspace.id,
      name: 'Payments API',
      key: 'PAY',
      description: 'Node service exposing payment intents, refunds and webhook handling.',
      repoUrl: 'https://github.com/mali123456-del/TESTPILOT-AI',
      baseUrl: API_SELF,
      environment: 'staging',
      allowedHosts: ['127.0.0.1', 'localhost'],
      createdAt: daysAgo(45),
    },
    {
      id: 'prj_atlas',
      workspaceId: workspace.id,
      name: 'Atlas Mobile',
      key: 'ATL',
      description: 'React Native companion app — regression and accessibility focus.',
      baseUrl: SELF_URL,
      environment: 'development',
      allowedHosts: ['127.0.0.1', 'localhost'],
      createdAt: daysAgo(20),
    },
  ];
  db.projects.push(...projects);

  const suitePlan: Array<{ projectId: string; name: string; type: TestType; description: string }> = [
    { projectId: 'prj_orbit', name: 'Checkout smoke', type: 'smoke', description: 'Fast confidence gate before every deployment.' },
    { projectId: 'prj_orbit', name: 'Cart & pricing unit', type: 'unit', description: 'Pure pricing, tax and discount logic.' },
    { projectId: 'prj_orbit', name: 'Checkout end-to-end', type: 'e2e', description: 'Browser journeys across the purchase funnel.' },
    { projectId: 'prj_orbit', name: 'Storefront accessibility', type: 'accessibility', description: 'Static WCAG-oriented checks on key pages.' },
    { projectId: 'prj_orbit', name: 'Visual baselines', type: 'visual', description: 'DOM fingerprint regressions for key pages.' },
    { projectId: 'prj_pay', name: 'Payment API contracts', type: 'api', description: 'Status, schema and latency assertions.' },
    { projectId: 'prj_pay', name: 'Payments security', type: 'security', description: 'Passive header and cookie hardening checks.' },
    { projectId: 'prj_pay', name: 'Ledger data integrity', type: 'database', description: 'Fixture-driven referential integrity.' },
    { projectId: 'prj_pay', name: 'Payments load profile', type: 'performance', description: 'Bounded concurrency probe against the health endpoint.' },
    { projectId: 'prj_atlas', name: 'Mobile regression', type: 'regression', description: 'Critical journeys re-run every release.' },
    { projectId: 'prj_atlas', name: 'Atlas cross-browser', type: 'cross-browser', description: 'Engine matrix through the Playwright adapter.' },
    { projectId: 'prj_orbit', name: 'Release acceptance', type: 'acceptance', description: 'Business sign-off scenarios.' },
  ];
  const suites: TestSuite[] = suitePlan.map((s, i) => ({ id: `ste_${i + 1}`, workspaceId: workspace.id, tags: [s.type], createdAt: daysAgo(40 - i), ...s }));
  db.suites.push(...suites);

  const sc = (id: string, s: TestSuite, title: string, priority: TestCase['priority'], extra: Partial<TestCase>): TestCase => ({
    id,
    workspaceId: workspace.id,
    projectId: s.projectId,
    suiteId: s.id,
    title,
    type: s.type,
    priority,
    automation: 'automated',
    tags: [s.type],
    timeoutMs: 15000,
    enabled: true,
    version: 1,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
    ...extra,
  });

  const cartSuite = suites[1];
  const smokeSuite = suites[0];
  const e2eSuite = suites[2];
  const a11ySuite = suites[3];
  const visualSuite = suites[4];
  const apiSuite = suites[5];
  const secSuite = suites[6];
  const dbSuite = suites[7];
  const perfSuite = suites[8];
  const regSuite = suites[9];
  const cbSuite = suites[10];
  const accSuite = suites[11];

  const cases: TestCase[] = [
    sc('case_calc_discount', cartSuite, 'Percentage discount is applied correctly', 'critical', {
      code: `const price = 200, pct = 15;\nconst discount = (price * pct) / 100;\nexpect(discount).toBe(30);\nexpect(price - discount).toBe(170);\ntest('discount never exceeds price', () => { expect(Math.min(discount, price)).toBeLessThan(price + 1); });`,
      description: 'Verifies percentage discount maths and clamping.',
    }),
    sc('case_cart_total', cartSuite, 'Cart total sums line items including quantities', 'high', {
      code: `const items = [{ price: 19.99, qty: 2 }, { price: 5, qty: 3 }];\nconst total = items.reduce((s, i) => s + i.price * i.qty, 0);\nexpect(Number(total.toFixed(2))).toBe(54.98);\ntest('empty cart totals zero', () => { expect([].reduce((s, i) => s + i.price * i.qty, 0)).toBe(0); });`,
    }),
    sc('case_tax_rounding', cartSuite, 'Tax rounding never produces sub-cent values', 'high', {
      code: `function tax(amount, rate) { return Math.round(amount * rate * 100) / 100; }\nexpect(tax(19.99, 0.2)).toBe(4);\nexpect(tax(0.01, 0.2)).toBe(0);\ntest('negative amount is rejected', () => { const t = (a) => { if (a < 0) throw new Error('negative'); return a; }; expect(() => t(-1)).toThrow(); });`,
    }),
    sc('case_inventory_guard', cartSuite, 'Inventory cannot go below zero', 'critical', {
      code: `function reserve(stock, qty) { if (qty > stock) throw new Error('Insufficient stock'); return stock - qty; }\nexpect(reserve(10, 4)).toBe(6);\nexpect(() => reserve(2, 5)).toThrow();\ntest('exact stock is allowed', () => { expect(reserve(3, 3)).toBe(0); });`,
    }),
    sc('case_coupon_stack', cartSuite, 'Coupons do not stack beyond the configured maximum', 'medium', {
      // Intentionally failing assertion to demonstrate real failure evidence and AI triage.
      code: `const maxDiscount = 0.3;\nconst requested = 0.25 + 0.15;\nconst applied = Math.min(requested, maxDiscount);\nexpect(applied).toBe(0.3);\nexpect(applied).toBe(0.4);`,
      description: 'Seeded example of a genuine assertion failure for triage demos.',
    }),
    sc('case_smoke_home', smokeSuite, 'Storefront responds and renders the shell', 'critical', {
      type: 'api',
      request: { method: 'GET', url: `${API_SELF}/api/health`, assertions: { status: 200, maxLatencyMs: 1500, jsonPath: { path: 'status', equals: 'ok' } } },
    }),
    sc('case_smoke_unknown_route', smokeSuite, 'Unknown API route returns a JSON 404', 'medium', {
      type: 'api',
      request: { method: 'GET', url: `${API_SELF}/api/definitely-not-a-route`, assertions: { status: 404 } },
    }),
    sc('case_smoke_unauth', smokeSuite, 'Protected endpoints reject anonymous callers', 'critical', {
      type: 'api',
      request: { method: 'GET', url: `${API_SELF}/api/projects`, assertions: { status: 401 } },
    }),
    sc('case_e2e_checkout', e2eSuite, 'Guest checkout journey (Playwright)', 'critical', {
      targetUrl: SELF_URL,
      steps: ['expect "TESTPILOT"', 'expect h1'],
      description: 'Requires the optional Playwright adapter; reports skipped with a clear reason when absent.',
    }),
    sc('case_e2e_command_palette', e2eSuite, 'Command palette opens with keyboard shortcut', 'high', {
      type: 'ui',
      targetUrl: `${SELF_URL}/app`,
      steps: ['expect "Overview"'],
    }),
    sc('case_a11y_app', a11ySuite, 'Application shell accessibility (static analysis)', 'high', {
      targetUrl: SELF_URL,
      timeoutMs: 20000,
    }),
    sc('case_a11y_docs', a11ySuite, 'Documentation page accessibility', 'medium', {
      targetUrl: `${SELF_URL}/app/docs`,
    }),
    sc('case_visual_dashboard', visualSuite, 'Dashboard DOM fingerprint baseline', 'medium', {
      targetUrl: SELF_URL,
    }),
    sc('case_api_health_contract', apiSuite, 'Health endpoint returns versioned contract', 'critical', {
      type: 'api',
      request: { method: 'GET', url: `${API_SELF}/api/health`, assertions: { status: 200, contains: '"status":"ok"', header: { name: 'content-type', includes: 'application/json' } } },
    }),
    sc('case_api_login_validation', apiSuite, 'Login rejects malformed payloads', 'high', {
      type: 'api',
      request: { method: 'POST', url: `${API_SELF}/api/auth/login`, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'not-an-email' }), assertions: { status: 400 } },
    }),
    sc('case_api_public_score', apiSuite, 'Public quality endpoint responds quickly', 'medium', {
      type: 'api',
      request: { method: 'GET', url: `${API_SELF}/api/public/score`, assertions: { status: 200, maxLatencyMs: 800 } },
    }),
    sc('case_sec_headers', secSuite, 'Security headers hardened on the API', 'high', {
      type: 'security',
      targetUrl: `${API_SELF}/api/health`,
    }),
    sc('case_sec_ui', secSuite, 'Web shell security headers', 'high', {
      targetUrl: SELF_URL,
    }),
    sc('case_db_orders', dbSuite, 'Orders reference existing customers', 'critical', {
      type: 'database',
      fixture: {
        tables: [
          { table: 'customers', rows: [{ id: 1 }, { id: 2 }] },
          { table: 'orders', rows: [{ id: 10, customer_id: 1, total: 54.98 }, { id: 11, customer_id: 2, total: 12 }] },
        ] satisfies DataFixture[],
        rules: {
          unique: [{ table: 'orders', field: 'id' }],
          required: [{ table: 'orders', field: 'total' }],
          foreignKeys: [{ table: 'orders', field: 'customer_id', references: { table: 'customers', field: 'id' } }],
          minRows: { orders: 2 },
        },
      },
    }),
    sc('case_db_orphans', dbSuite, 'Detects orphaned order rows', 'medium', {
      type: 'database',
      fixture: {
        tables: [
          { table: 'customers', rows: [{ id: 1 }] },
          { table: 'orders', rows: [{ id: 20, customer_id: 99, total: 5 }] },
        ],
        rules: { foreignKeys: [{ table: 'orders', field: 'customer_id', references: { table: 'customers', field: 'id' } }] },
      },
    }),
    sc('case_perf_health', perfSuite, 'Health endpoint p95 under 800ms at 20 req/s', 'high', {
      type: 'performance',
      targetUrl: `${API_SELF}/api/health`,
      request: { method: 'GET', url: `${API_SELF}/api/health`, assertions: { maxLatencyMs: 800 } },
      fixture: { requests: 40, concurrency: 5 },
      timeoutMs: 45000,
    }),
    sc('case_reg_login', regSuite, 'Authentication regression after release', 'critical', {
      type: 'api',
      request: { method: 'POST', url: `${API_SELF}/api/auth/login`, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@testpilot.ai', password: 'Demo1234!' }), assertions: { status: 200, contains: 'csrfToken' } },
    }),
    sc('case_cb_chromium', cbSuite, 'Chromium engine matrix', 'medium', {
      targetUrl: SELF_URL,
      steps: ['expect "TESTPILOT"'],
    }),
    sc('case_acc_release', accSuite, 'Business acceptance: QA dashboard is usable', 'high', {
      type: 'api',
      request: { method: 'GET', url: `${API_SELF}/api/public/score`, assertions: { status: 200, jsonPath: { path: 'product', equals: 'TESTPILOT AI' } } },
    }),
  ];
  db.cases.push(...cases);

  // Historical runs (clearly labelled demo data in the UI/docs).
  const runnable = cases.filter((c) => !['case_e2e_checkout', 'case_e2e_command_palette', 'case_cb_chromium'].includes(c.id));
  for (let i = 0; i < 14; i += 1) {
    const suite = suites[i % suites.length];
    const suiteCases = runnable.filter((c) => c.suiteId === suite.id);
    if (!suiteCases.length) continue;
    const results = suiteCases.map((c) => {
      const flaky = c.id === 'case_tax_rounding' || c.id === 'case_coupon_stack';
      const fail = c.id === 'case_coupon_stack' ? rand() > 0.3 : flaky ? rand() > 0.65 : rand() > 0.93;
      const status = fail ? ('failed' as const) : ('passed' as const);
      return {
        caseId: c.id,
        title: c.title,
        type: c.type,
        status,
        durationMs: Math.round(40 + rand() * 900),
        message: status === 'failed' ? 'Assertion mismatch: expected 0.4 but received 0.3' : 'Passed',
        startedAt: daysAgo(13 - i, i % 6),
      };
    });
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: 0,
      error: 0,
    };
    db.runs.push({
      id: id('run'),
      workspaceId: workspace.id,
      projectId: suite.projectId,
      suiteId: suite.id,
      status: summary.failed ? 'failed' : 'passed',
      trigger: i % 3 === 0 ? 'schedule' : 'manual',
      triggeredBy: i % 2 ? 'Ava Rahman' : 'CI pipeline',
      startedAt: daysAgo(13 - i, i % 6),
      finishedAt: daysAgo(13 - i, i % 6),
      durationMs: Math.round(1200 + rand() * 8000),
      results,
      summary,
      logs: [`Demo historical run for ${suite.name}`],
      aiAnalysis: summary.failed ? 'Assertion mismatch — verify the coupon stacking rule against the latest business decision.' : undefined,
    } satisfies Run);
  }

  const bugs: Bug[] = [
    {
      id: 'bug_1',
      workspaceId: workspace.id,
      projectId: 'prj_orbit',
      title: 'Coupon stacking exceeds the 30% maximum',
      description: 'Two coupons (25% + 15%) produce a 40% discount instead of being capped at 30%.',
      severity: 'critical',
      status: 'in_progress',
      reproduction: '1. Add two eligible items to the cart\n2. Apply SAVE25 then EXTRA15\n3. Observe the order total',
      aiRootCause: 'The clamp is applied per coupon instead of to the aggregated discount.',
      assignee: 'Noah Kim',
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
    },
    {
      id: 'bug_2',
      workspaceId: workspace.id,
      projectId: 'prj_pay',
      title: 'Refund webhook retries duplicate ledger entries',
      description: 'A retried refund webhook creates a second ledger row because the idempotency key is not persisted.',
      severity: 'high',
      status: 'open',
      createdAt: daysAgo(6),
      updatedAt: daysAgo(2),
    },
    {
      id: 'bug_3',
      workspaceId: workspace.id,
      projectId: 'prj_atlas',
      title: 'Mobile nav focus escapes the drawer',
      description: 'Keyboard focus moves behind the open navigation drawer on Android Chrome.',
      severity: 'medium',
      status: 'open',
      createdAt: daysAgo(4),
      updatedAt: daysAgo(4),
    },
    {
      id: 'bug_4',
      workspaceId: workspace.id,
      projectId: 'prj_orbit',
      title: 'Product images missing alt text',
      description: 'Grid images on the listing page have no alt attributes, failing the accessibility gate.',
      severity: 'medium',
      status: 'resolved',
      createdAt: daysAgo(11),
      updatedAt: daysAgo(7),
    },
    {
      id: 'bug_5',
      workspaceId: workspace.id,
      projectId: 'prj_pay',
      title: 'Health check occasionally exceeds 800ms',
      description: 'Cold starts push p95 above the SLO. Warm instances are within budget.',
      severity: 'low',
      status: 'closed',
      createdAt: daysAgo(18),
      updatedAt: daysAgo(9),
    },
  ];
  db.bugs.push(...bugs);

  const workflows: Workflow[] = [
    {
      id: 'wf_release_gate',
      workspaceId: workspace.id,
      projectId: 'prj_orbit',
      name: 'Release gate',
      enabled: true,
      steps: [
        { id: 's1', type: 'run-suite', label: 'Run checkout smoke', config: { suiteId: 'ste_1' } },
        { id: 's2', type: 'condition', label: 'Only continue when smoke is green', config: { on: 'failure', action: 'stop' } },
        { id: 's3', type: 'run-suite', label: 'Run end-to-end journeys', config: { suiteId: 'ste_3' } },
        { id: 's4', type: 'approval', label: 'QA lead sign-off', config: { approverRole: 'qa_lead' } },
        { id: 's5', type: 'notify', label: 'Notify the release channel', config: { channel: '#releases' } },
      ],
      retry: { attempts: 1, backoffMs: 2000 },
      parallel: false,
      timeoutMs: 900000,
      createdAt: daysAgo(21),
      lastRunAt: daysAgo(2),
    },
    {
      id: 'wf_nightly',
      workspaceId: workspace.id,
      projectId: 'prj_pay',
      name: 'Nightly API regression',
      enabled: true,
      steps: [
        { id: 's1', type: 'run-suite', label: 'Payment API contracts', config: { suiteId: 'ste_6' } },
        { id: 's2', type: 'run-suite', label: 'Payments security', config: { suiteId: 'ste_7' } },
      ],
      retry: { attempts: 2, backoffMs: 5000 },
      parallel: false,
      timeoutMs: 600000,
      createdAt: daysAgo(14),
    },
  ];
  db.workflows.push(...workflows);

  const schedules: Schedule[] = [
    { id: 'sch_smoke', workspaceId: workspace.id, projectId: 'prj_orbit', suiteId: 'ste_1', name: 'Hourly smoke', intervalMinutes: 60, enabled: true, lastRunAt: daysAgo(0, -2), createdAt: daysAgo(30) },
    { id: 'sch_api', workspaceId: workspace.id, projectId: 'prj_pay', suiteId: 'ste_6', name: 'Nightly contracts', intervalMinutes: 1440, enabled: true, lastRunAt: daysAgo(1), createdAt: daysAgo(25) },
  ];
  db.schedules.push(...schedules);

  const collections: ApiCollection[] = [
    {
      id: 'col_payments',
      workspaceId: workspace.id,
      projectId: 'prj_pay',
      name: 'Payments API · staging',
      environment: { baseUrl: API_SELF, token: '{{secrets.staging_token}}' },
      requests: [
        { id: 'req_health', name: 'Health', spec: { method: 'GET', url: `${API_SELF}/api/health`, assertions: { status: 200 } } },
        { id: 'req_score', name: 'Public score', spec: { method: 'GET', url: `${API_SELF}/api/public/score`, assertions: { status: 200 } } },
        { id: 'req_login', name: 'Login', spec: { method: 'POST', url: `${API_SELF}/api/auth/login`, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@testpilot.ai', password: 'Demo1234!' }), assertions: { status: 200 } } },
      ],
      createdAt: daysAgo(18),
    },
  ];
  db.collections.push(...collections);

  const integrations: Integration[] = [
    { id: 'int_github', workspaceId: workspace.id, name: 'GitHub', category: 'repository', status: 'configured', detail: 'mali123456-del/TESTPILOT-AI · pull-request status checks', config: { repo: 'mali123456-del/TESTPILOT-AI' }, createdAt: now() },
    { id: 'int_gitlab', workspaceId: workspace.id, name: 'GitLab', category: 'repository', status: 'available', detail: 'Connect a project with a personal access token to sync merge requests.', createdAt: now() },
    { id: 'int_gha', workspaceId: workspace.id, name: 'GitHub Actions', category: 'ci', status: 'configured', detail: 'Workflow `.github/workflows/testpilot.yml` triggers runs through the inbound webhook.', createdAt: now() },
    { id: 'int_vscode', workspaceId: workspace.id, name: 'VS Code', category: 'framework', status: 'available', detail: 'Use the REST API from tasks.json; a dedicated extension is on the roadmap.', createdAt: now() },
    { id: 'int_playwright', workspaceId: workspace.id, name: 'Playwright', category: 'framework', status: 'available', detail: 'Optional adapter. Install with `npm i -D playwright && npx playwright install chromium`.', createdAt: now() },
    { id: 'int_selenium', workspaceId: workspace.id, name: 'Selenium', category: 'framework', status: 'unavailable', detail: 'No driver manager is bundled. Export cases as JSON for an external Selenium runner.', createdAt: now() },
    { id: 'int_jest', workspaceId: workspace.id, name: 'Jest / Vitest', category: 'framework', status: 'available', detail: 'Import compatible test files or paste assertion blocks into the sandboxed unit runner.', createdAt: now() },
    { id: 'int_pytest', workspaceId: workspace.id, name: 'Pytest', category: 'framework', status: 'unavailable', detail: 'Python execution is not bundled. API cases can still validate Python services over HTTP.', createdAt: now() },
    { id: 'int_jira', workspaceId: workspace.id, name: 'Jira', category: 'issue-tracker', status: 'available', detail: 'Configure site URL, email and API token to push defects as issues.', createdAt: now() },
    { id: 'int_webhook', workspaceId: workspace.id, name: 'Outbound webhooks', category: 'webhook', status: 'configured', detail: 'HMAC-signed run.completed events to the configured endpoint.', createdAt: now() },
  ];
  db.integrations.push(...integrations);

  db.audit.push(
    { id: id('aud'), workspaceId: workspace.id, actor: 'Ava Rahman', action: 'workspace.created', target: workspace.name, ip: '127.0.0.1', createdAt: daysAgo(64) },
    { id: id('aud'), workspaceId: workspace.id, actor: 'Noah Kim', action: 'run.triggered', target: 'Checkout smoke', ip: '127.0.0.1', createdAt: daysAgo(2) },
    { id: id('aud'), workspaceId: workspace.id, actor: 'Mila Ortega', action: 'bug.created', target: 'Coupon stacking exceeds the 30% maximum', ip: '127.0.0.1', createdAt: daysAgo(3) },
  );

  db.approvals.push({
    id: 'apr_1',
    workspaceId: workspace.id,
    kind: 'ai.case-generation',
    title: 'Approve 6 AI-generated cases for Checkout smoke',
    payload: { projectId: 'prj_orbit', suiteId: 'ste_1', cases: 6, requestedBy: 'Mila Ortega' },
    requestedBy: 'Mila Ortega',
    status: 'pending',
    createdAt: daysAgo(1),
  });

  for (const p of projects) {
    const runs = db.runs.filter((r) => r.projectId === p.id);
    const passed = runs.reduce((n, r) => n + r.summary.passed, 0);
    const executed = runs.reduce((n, r) => n + r.summary.passed + r.summary.failed, 0);
    p.qualityScore = executed ? Math.round((passed / executed) * 100) : 0;
  }

  saveDb();
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
