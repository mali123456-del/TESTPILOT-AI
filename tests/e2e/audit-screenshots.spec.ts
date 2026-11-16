import { test } from './fixtures';

test('audit screenshots - key pages', async ({ page }) => {
  const loginRes = await page.request.fetch('http://127.0.0.1:4318/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ email: 'demo@testpilot.ai', password: 'Demo1234!' }),
  });
  const setCookieHeader = loginRes.headers()['set-cookie'] || '';
  const sessionMatch = setCookieHeader.match(/tp_session=([^;]+)/);
  if (sessionMatch) {
    await page.context().addCookies([{
      name: 'tp_session',
      value: sessionMatch[1],
      url: 'http://127.0.0.1:4317',
      httpOnly: true,
      sameSite: 'Lax',
    }]);
  }

  await page.goto('/login');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/audit/01-login.png', fullPage: true });

  await page.goto('/app');
  await page.waitForURL(/\/app\/?/, { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/audit/02-dashboard.png', fullPage: true });

  await page.goto('/app/projects');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/audit/03-projects.png', fullPage: true });

  await page.goto('/app/runs');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/audit/04-runs.png', fullPage: true });

  await page.goto('/app/assistant');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/audit/05-assistant.png', fullPage: true });

  await page.goto('/app/security');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/audit/06-security.png', fullPage: true });

  await page.goto('/app/reports');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/audit/07-reports.png', fullPage: true });

  console.log('All key screenshots captured');
});
