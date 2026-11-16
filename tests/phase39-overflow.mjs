import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4317';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 834, height: 1112 } });
const page = await context.newPage();

await page.goto(`${BASE}/login`);
await page.fill('input[type=email]', 'preview@testpilot.local');
await page.fill('input[type=password]', 'Preview1234!');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForSelector('main', { timeout: 25000 });

const overflow = () =>
  page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const pageOverflow = document.documentElement.scrollWidth > docW + 1;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > docW + 1 || r.right > docW + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        bad.push(`${el.tagName.toLowerCase()}.${cls.split(' ').slice(0, 3).join('.')} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
        if (bad.length > 6) break;
      }
    }
    return { pageOverflow, scrollWidth: document.documentElement.scrollWidth, clientWidth: docW, bad };
  });

for (const [name, vp] of [['tablet-834', { width: 834, height: 1112 }], ['mobile-390', { width: 390, height: 844 }]]) {
  await page.setViewportSize(vp);
  await page.goto(`${BASE}/app/benchmarks`);
  await page.waitForSelector('text=AI model inventory', { timeout: 25000 });
  await page.waitForTimeout(700);
  const inv = await overflow();
  console.log(`${name} inventory:`, inv);
  await page.screenshot({ path: `docs/screenshots/phase39-benchmarks-${name}.png`, fullPage: true });
  // Run detail view too (widest content)
  await page.getByRole('button', { name: 'History' }).click();
  await page.waitForSelector('text=Benchmark history', { timeout: 10000 });
  await page.locator('tbody tr').first().click();
  await page.waitForSelector('text=Pass rate', { timeout: 10000 });
  await page.waitForTimeout(500);
  const det = await overflow();
  console.log(`${name} run-detail:`, det);
  await page.screenshot({ path: `docs/screenshots/phase39-benchmarks-${name}-run-detail.png`, fullPage: true });
}

await context.close();
await browser.close();
console.log('done');
