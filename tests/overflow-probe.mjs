import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4317';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto(`${BASE}/app`);
await page.waitForSelector('input[type=email]', { timeout: 15000 });
await page.fill('input[type=email]', 'demo@testpilot.ai');
await page.fill('input[type=password]', 'Demo1234!');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForSelector('main', { timeout: 20000 });

const pages = ['runs', 'docs', 'integrations'];
for (const p of pages) {
  await page.goto(`${BASE}/app/${p}`);
  await page.waitForSelector('main', { timeout: 20000 });
  await page.waitForTimeout(900);
  const report = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > docW + 1 || r.right > docW + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        bad.push(`${el.tagName.toLowerCase()}.${cls.split(' ').slice(0, 3).join('.')} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
        if (bad.length > 12) break;
      }
    }
    return bad;
  });
  console.log(`--- ${p} ---`);
  console.log(report.join('\n') || 'no overflowing elements');
}
await browser.close();
