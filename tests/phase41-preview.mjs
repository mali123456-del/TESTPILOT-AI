import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4317';
const OUT = 'docs/screenshots/phase41';
fs.mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];

async function run() {
  const browser = await chromium.launch({ executablePath: 'C:\\Users\\Muhammed Ali\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1148\\chrome-win\\headless_shell.exe' });
  
  // Use pre-created session cookie
  const sessionValue = 'cGx_Yu4VyVRFBOIfzPiHstpDD_TMd3C1';
  
  for (const vp of viewports) {
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await context.addCookies([{
      name: 'tp_session', value: sessionValue, url: 'http://127.0.0.1:4317',
      httpOnly: true, sameSite: 'Lax',
    }]);
    
    const page = await context.newPage();
    
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    
    const checkOverflow = async () => {
      return page.evaluate(() => {
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
    };
    
    // 1. AI Routing Dashboard
    try {
      await page.goto(`${BASE}/app/ai/routing-dashboard`);
      await page.waitForSelector('text=AI Routing Dashboard', { timeout: 25000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/phase41-routing-dashboard-${vp.name}.png`, fullPage: true });
      const of = await checkOverflow();
      console.log(`  Routing Dashboard: ${of.pageOverflow ? 'HAS OVERFLOW' : 'OK'}`);
      if (of.bad.length) console.log('  Overflow elements:', of.bad);
    } catch (e) {
      console.log(`  Routing Dashboard: ERROR - ${e.message}`);
    }
    
    // 2. Routing Rules Manager
    try {
      await page.goto(`${BASE}/app/ai/routing-rules`);
      await page.waitForSelector('text=Routing Rules Manager', { timeout: 25000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/phase41-routing-rules-${vp.name}.png`, fullPage: true });
      const of = await checkOverflow();
      console.log(`  Routing Rules: ${of.pageOverflow ? 'HAS OVERFLOW' : 'OK'}`);
      if (of.bad.length) console.log('  Overflow elements:', of.bad);
    } catch (e) {
      console.log(`  Routing Rules: ERROR - ${e.message}`);
    }
    
    // 3. Multi-Model Benchmark Runner
    try {
      await page.goto(`${BASE}/app/ai/benchmark-runner`);
      await page.waitForSelector('text=Multi-Model Benchmark Runner', { timeout: 25000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/phase41-benchmark-runner-${vp.name}.png`, fullPage: true });
      const of = await checkOverflow();
      console.log(`  Benchmark Runner: ${of.pageOverflow ? 'HAS OVERFLOW' : 'OK'}`);
      if (of.bad.length) console.log('  Overflow elements:', of.bad);
    } catch (e) {
      console.log(`  Benchmark Runner: ERROR - ${e.message}`);
    }
    
    // 4. Playground Session Manager
    try {
      await page.goto(`${BASE}/app/ai/playground-sessions`);
      await page.waitForSelector('text=Playground Session Manager', { timeout: 25000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/phase41-playground-sessions-${vp.name}.png`, fullPage: true });
      const of = await checkOverflow();
      console.log(`  Playground Sessions: ${of.pageOverflow ? 'HAS OVERFLOW' : 'OK'}`);
      if (of.bad.length) console.log('  Overflow elements:', of.bad);
    } catch (e) {
      console.log(`  Playground Sessions: ERROR - ${e.message}`);
    }
    
    // 5. AI Orchestration Analytics
    try {
      await page.goto(`${BASE}/app/ai/orchestration-analytics`);
      await page.waitForSelector('text=AI Orchestration Analytics', { timeout: 25000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/phase41-orchestration-analytics-${vp.name}.png`, fullPage: true });
      const of = await checkOverflow();
      console.log(`  Orchestration Analytics: ${of.pageOverflow ? 'HAS OVERFLOW' : 'OK'}`);
      if (of.bad.length) console.log('  Overflow elements:', of.bad);
    } catch (e) {
      console.log(`  Orchestration Analytics: ERROR - ${e.message}`);
    }
    
    // Also check existing Phase 40 panels work
    const phase40Panels = [
      { name: 'providers', path: '/app/ai/providers', title: 'AI Provider Center' },
      { name: 'models', path: '/app/ai/models', title: 'AI Model Registry' },
      { name: 'playground', path: '/app/ai/playground', title: 'AI Playground' },
      { name: 'health', path: '/app/ai/health', title: 'AI Health' },
      { name: 'routing', path: '/app/ai/routing', title: 'Intelligent Routing' },
      { name: 'activity', path: '/app/ai/activity', title: 'Provider Activity' },
    ];
    
    for (const panel of phase40Panels) {
      try {
        await page.goto(`${BASE}${panel.path}`);
        await page.waitForSelector(`text=${panel.title}`, { timeout: 15000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/phase41-${panel.name}-${vp.name}.png`, fullPage: true });
        const of = await checkOverflow();
        console.log(`  ${panel.name}: ${of.pageOverflow ? 'HAS OVERFLOW' : 'OK'}`);
        if (of.bad.length) console.log('  Overflow elements:', of.bad);
      } catch (e) {
        console.log(`  ${panel.name}: ERROR - ${e.message}`);
      }
    }
    
    await context.close();
    console.log(`  Page errors: ${errors.length}`);
    if (errors.length) console.log('  Errors:', errors);
  }
  
  await browser.close();
  console.log('\n=== Phase 41 Preview Complete ===');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});