import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4317';
const RUN = process.env.PREVIEW_RUN ?? 'run_aaadd17f16919e6238';
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function session(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type=email]', 'preview@testpilot.local');
  await page.fill('input[type=password]', 'Preview1234!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForSelector('main', { timeout: 25000 });
  return { context, page };
}

async function overflow(page) {
  return page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const pageOverflow = document.documentElement.scrollWidth > docW + 1;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > docW + 1 || r.right > docW + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        bad.push(`${el.tagName.toLowerCase()}.${cls.split(' ').slice(0, 3).join('.')} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
        if (bad.length > 8) break;
      }
    }
    return { pageOverflow, scrollWidth: document.documentElement.scrollWidth, clientWidth: docW, bad };
  });
}

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 834, height: 1112 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const { context, page } = await session(viewport);
  await page.goto(`${BASE}/app/runs/${RUN}/execute`);
  await page.waitForSelector('text=Manual run', { timeout: 25000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/phase38-workspace-${name}.png`, fullPage: true });

  await page.goto(`${BASE}/app/runs`);
  await page.waitForSelector('text=Run history', { timeout: 25000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/phase38-runs-${name}.png`, fullPage: true });

  if (name === 'desktop') {
    await page.getByRole('button', { name: /new run/i }).click();
    await page.waitForSelector('text=Create a test run', { timeout: 10000 });
    await page.getByRole('button', { name: /^Manual$/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/phase38-newrun-manual.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  console.log(name, 'overflow:', await overflow(page));
  await context.close();
}

await browser.close();
console.log('screenshots written to', OUT);
