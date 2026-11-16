import { test as base } from 'playwright/test';
import { expect } from 'playwright/test';

export const test = base.extend<{
  loginAs: (email?: string, password?: string) => Promise<void>;
}>({
  loginAs: async ({ page, context }, use) => {
    const login = async (email = 'demo@testpilot.ai', password = 'Demo1234!') => {
      // Call login API using Node's fetch (test runs in Node context)
      const res = await fetch('http://127.0.0.1:4318/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Login failed with status ${res.status}`);
      }

      const setCookieHeader = res.headers.get('set-cookie') || '';
      const sessionMatch = setCookieHeader.match(/tp_session=([^;]+)/);

      if (sessionMatch) {
        await context.addCookies([{
          name: 'tp_session',
          value: sessionMatch[1],
          url: 'http://127.0.0.1:4317',
          httpOnly: true,
          sameSite: 'Lax',
        }]);
      }

      // Navigate to app
      await page.goto('/app');
      await page.waitForURL(/\/app\/?/, { timeout: 10000 });

      // Handle must-change-password redirect if needed
      const changePwd = page.locator('h1:has-text("Set a new password")');
      if (await changePwd.isVisible()) {
        await page.locator('input[type="password"]').first().fill('NewPassword123!');
        await page.locator('input[type="password"]').nth(1).fill('NewPassword123!');
        await page.locator('button:has-text("Update password")').click();
        await expect(page).toHaveURL(/\/app\/?/);
      } else {
        await expect(page).toHaveURL(/\/app\/?/);
      }
    };
    await use(login);
  },
});

export { expect };
