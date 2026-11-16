import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4317';
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function overflow(page) {
  return page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const pageOverflow = document.documentElement.scrollWidth > docW + 1;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > docW + 1 || r.right > docW + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        bad.push(`${el.tagName.toLowerCase()}.${cls.split(' ').slice(0, 3).join('.')} w=${Math.round(r.width)}`);
        if (bad.length > 8) break;
      }
    }
    return { pageOverflow, scrollWidth: document.documentElement.scrollWidth, clientWidth: docW, bad };
  });
}

const { context, page } = await (async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type=email]', 'preview@testpilot.local');
  await page.fill('input[type=password]', 'Preview1234!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForSelector('main', { timeout: 25000 });
  return { context, page };
})();

// 1. Inventory tab (default)
await page.goto(`${BASE}/app/benchmarks`);
await page.waitForSelector('text=AI model inventory', { timeout: 25000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase39-benchmarks-inventory.png`, fullPage: true });
console.log('inventory overflow:', await overflow(page));

// 2. Suites tab
await page.getByRole('button', { name: 'Suites' }).click();
await page.waitForSelector('text=Benchmark test suites', { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/phase39-benchmarks-suites.png`, fullPage: true });

// 3. History tab, then open the newest run detail
await page.getByRole('button', { name: 'History' }).click();
await page.waitForSelector('text=Benchmark history', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/phase39-benchmarks-history.png`, fullPage: true });
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Pass rate', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/phase39-benchmarks-run-detail.png`, fullPage: true });
console.log('detail overflow:', await overflow(page));

// 4. Leaderboard tab
await page.getByRole('button', { name: 'Leaderboard' }).click();
await page.waitForSelector('text=Model leaderboard', { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/phase39-benchmarks-leaderboard.png`, fullPage: true });

// 5. Compare tab
await page.getByRole('button', { name: 'Compare' }).click();
await page.waitForSelector('text=Before / after comparison', { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/phase39-benchmarks-compare.png`, fullPage: true });

// 6. Live execution: run the benchmark from the UI itself (Run & results tab)
await page.getByRole('button', { name: 'Run & results' }).click();
await page.waitForSelector('text=Live benchmark execution', { timeout: 10000 });
await page.getByRole('button', { name: /Run 7 suite/ }).click();
await page.waitForSelector('text=completed: pass rate', { timeout: 60000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase39-benchmarks-live-run.png`, fullPage: true });
console.log('live-run overflow:', await overflow(page));

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.waitForTimeout(300);
if (errors.length) console.log('PAGE ERRORS:', errors);

await context.close();
await browser.close();
console.log('screenshots written to', OUT);
