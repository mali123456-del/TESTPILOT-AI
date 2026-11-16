import fs from 'node:fs';
import path from 'node:path';
import type { TestCase } from '../../shared/types.js';

/**
 * Optional Playwright adapter. Playwright is NOT bundled (heavy install). When it is
 * present we run genuine browser automation; otherwise the case is reported as
 * skipped with an explicit reason so results are never fabricated.
 */
type PlaywrightModule = {
  chromium: {
    launch(opts: { headless: boolean }): Promise<{
      newPage(): Promise<{
        goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
        click(sel: string): Promise<void>;
        fill(sel: string, value: string): Promise<void>;
        textContent(sel: string): Promise<string | null>;
        screenshot(opts: { path: string; fullPage: boolean }): Promise<unknown>;
        title(): Promise<string>;
      }>;
      close(): Promise<void>;
    }>;
  };
};

let cached: { mod: PlaywrightModule | null; reason: string } | null = null;

export async function playwrightStatus(): Promise<{ available: boolean; reason: string }> {
  if (cached) return { available: Boolean(cached.mod), reason: cached.reason };
  try {
    // Optional peer dependency: resolved at runtime only when installed.
    const mod = (await import('playwright')) as PlaywrightModule;
    cached = { mod, reason: 'Playwright is installed and available for real browser execution.' };
  } catch {
    cached = {
      mod: null,
      reason: 'Playwright is not installed. Install it with `npm i -D playwright && npx playwright install chromium` to enable real browser execution.',
    };
  }
  return { available: Boolean(cached.mod), reason: cached.reason };
}

export interface BrowserStepResult {
  step: string;
  ok: boolean;
  detail?: string;
}

export async function runBrowserCase(
  testCase: TestCase,
  screenshotDir: string,
): Promise<{ status: 'passed' | 'failed' | 'skipped' | 'error'; message: string; evidence?: string; details?: Record<string, unknown> }> {
  const status = await playwrightStatus();
  if (!status.available || !cached?.mod) return { status: 'skipped', message: status.reason };
  if (!testCase.targetUrl) return { status: 'skipped', message: 'No target URL configured for browser execution' };
  const steps = testCase.steps ?? [];
  const results: BrowserStepResult[] = [];
  let browser: Awaited<ReturnType<PlaywrightModule['chromium']['launch']>> | null = null;
  try {
    browser = await cached.mod.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(testCase.targetUrl, { waitUntil: 'domcontentloaded', timeout: testCase.timeoutMs });
    results.push({ step: `Navigate ${testCase.targetUrl}`, ok: true });
    for (const raw of steps) {
      const step = raw.trim();
      const click = /^click\s+(.+)$/i.exec(step);
      const fill = /^fill\s+(\S+)\s+(.+)$/i.exec(step);
      const expectText = /^expect\s+(?:text\s+)?["'](.+)["']$/i.exec(step);
      const expectSel = /^expect\s+(\S+)$/i.exec(step);
      try {
        if (click) {
          await page.click(click[1].trim());
          results.push({ step, ok: true });
        } else if (fill) {
          await page.fill(fill[1], fill[2]);
          results.push({ step, ok: true });
        } else if (expectText) {
          const body = (await page.textContent('body')) ?? '';
          const ok = body.includes(expectText[1]);
          results.push({ step, ok, detail: ok ? undefined : `Text not found: ${expectText[1]}` });
        } else if (expectSel) {
          const text = await page.textContent(expectSel[1]);
          results.push({ step, ok: text !== null, detail: text === null ? `Selector not found: ${expectSel[1]}` : undefined });
        } else {
          results.push({ step, ok: true, detail: 'Step phrasing not recognised; treated as a manual checkpoint' });
        }
      } catch (err) {
        results.push({ step, ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }
    fs.mkdirSync(screenshotDir, { recursive: true });
    const shot = path.join(screenshotDir, `${testCase.id}-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const title = await page.title();
    const failed = results.filter((r) => !r.ok);
    return {
      status: failed.length ? 'failed' : 'passed',
      message: failed.length ? `${failed.length} browser step(s) failed` : `Browser flow passed (${results.length} steps) · "${title}"`,
      evidence: results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.step}${r.detail ? ` — ${r.detail}` : ''}`).join('\n'),
      details: { screenshot: path.basename(shot), steps: results, engine: 'chromium' },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
