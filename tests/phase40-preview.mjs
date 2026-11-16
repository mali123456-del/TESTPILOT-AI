import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4317';
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Login via API then set cookie
const res = await fetch('http://127.0.0.1:4318/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@testpilot.local', password: 'TestPass123!' }),
});
const setCookie = res.headers.get('set-cookie') || '';
const sessionMatch = setCookie.match(/tp_session=([^;]+)/);
if (sessionMatch) {
  await context.addCookies([{
    name: 'tp_session', value: sessionMatch[1], url: 'http://127.0.0.1:4317',
    httpOnly: true, sameSite: 'Lax',
  }]);
}

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const overflow = () =>
  page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const pageOverflow = document.documentElement.scrollWidth > docW + 1;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > docW + 1 || r.right > docW + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        bad.push(`${el.tagName.toLowerCase()}.${cls.split(' ').slice(0, 3).join('.')} w=${Math.round(r.width)}`);
        if (bad.length > 6) break;
      }
    }
    return { pageOverflow, scrollWidth: document.documentElement.scrollWidth, clientWidth: docW, bad };
  });

// 1. AI Providers
await page.goto(`${BASE}/app/ai/providers`);
await page.waitForSelector('text=AI Provider Center', { timeout: 25000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase40-providers-desktop.png`, fullPage: true });
console.log('providers overflow:', await overflow(page));

// 2. AI Models
await page.goto(`${BASE}/app/ai/models`);
await page.waitForSelector('text=AI Model Registry', { timeout: 25000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase40-models-desktop.png`, fullPage: true });

// 3. AI Playground
await page.goto(`${BASE}/app/ai/playground`);
await page.waitForSelector('text=Multi-Model Playground', { timeout: 25000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase40-playground-desktop.png`, fullPage: true });

// 4. AI Health
await page.goto(`${BASE}/app/ai/health`);
await page.waitForSelector('text=Provider Health Monitor', { timeout: 25000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase40-health-desktop.png`, fullPage: true });

// 5. AI Routing
await page.goto(`${BASE}/app/ai/routing`);
await page.waitForSelector('text=Intelligent Routing Settings', { timeout: 25000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase40-routing-desktop.png`, fullPage: true });

// 6. AI Activity
await page.goto(`${BASE}/app/ai/activity`);
await page.waitForSelector('text=Provider Activity History', { timeout: 25000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/phase40-activity-desktop.png`, fullPage: true });

// 7. Responsive checks
for (const [name, vp] of [['tablet-834', { width: 834, height: 1112 }], ['mobile-390', { width: 390, height: 844 }]]) {
  await page.setViewportSize(vp);
  await page.goto(`${BASE}/app/ai/providers`);
  await page.waitForSelector('text=AI Provider Center', { timeout: 25000 });
  await page.waitForTimeout(700);
  const inv = await overflow();
  console.log(name + ' providers:', inv);
  await page.screenshot({ path: `${OUT}/phase40-providers-${name}.png`, fullPage: true });
}

if (errors.length) console.log('PAGE ERRORS:', errors);

await context.close();
await browser.close();
console.log('Phase 40 screenshots written to', OUT);
