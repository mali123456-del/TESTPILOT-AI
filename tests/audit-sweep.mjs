/* Initial UI audit sweep — responsive + console errors.
   Run: node tests/audit-sweep.mjs  (dev servers must be running) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4317';
const OUT = path.resolve('docs/audit-screens');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-834', width: 834, height: 1112 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const PAGES = ['', 'projects', 'runs', 'automation', 'assistant', 'agents', 'api', 'performance', 'security', 'bugs', 'reports', 'integrations', 'team', 'docs'];

const browser = await chromium.launch();
const findings = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleMsgs.push(`${page.url()} | ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => consoleMsgs.push(`${page.url()} | pageerror: ${String(e).slice(0, 160)}`));

  // login
  await page.goto(`${BASE}/app`);
  await page.waitForSelector('input[type=email]', { timeout: 15000 }).catch(() => {});
  if (await page.locator('input[type=email]').count()) {
    await page.fill('input[type=email]', 'demo@testpilot.ai');
    await page.fill('input[type=password]', 'Demo1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await page.waitForSelector('main', { timeout: 20000 });

  for (const p of PAGES) {
    await page.goto(`${BASE}/app/${p}`);
    await page.waitForSelector('main', { timeout: 20000 });
    await page.waitForTimeout(900); // allow data rows to appear
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-${(p || 'overview').replace('/', '')}.png`), fullPage: false });
    findings.push({ viewport: vp.name, page: p || '/', horizOverflowPx: overflow });
  }
  const dedup = [...new Set(consoleMsgs)];
  for (const msg of dedup.slice(0, 30)) findings.push({ viewport: vp.name, consoleError: msg });
  await context.close();
}
await browser.close();
fs.writeFileSync(path.resolve('docs/audit-sweep-results.json'), JSON.stringify(findings, null, 2));
const overflowIssues = findings.filter((f) => f.horizOverflowPx > 1);
const consoleIssues = findings.filter((f) => f.consoleError);
console.log('overflow issues:', overflowIssues.length);
console.log('console error pages:', consoleIssues.length);
console.log(JSON.stringify({ overflowIssues, consoleIssues: consoleIssues.slice(0, 40) }, null, 2).slice(0, 6000));
