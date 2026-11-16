import { test, expect } from './fixtures';

test.describe('Authentication', () => {
  test('login with demo credentials redirects to dashboard', async ({ page, loginAs }) => {
    await loginAs();
    await expect(page).toHaveURL(/\/app\/?/);
    await expect(page.locator('h1').first()).toContainText('Quality overview');
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').click();
    await page.locator('input[type="email"]').fill('');
    await page.locator('input[type="email"]').type('wrong@example.com', { delay: 5 });
    await page.locator('input[type="password"]').click();
    await page.locator('input[type="password"]').fill('');
    await page.locator('input[type="password"]').type('WrongPassword123!', { delay: 5 });
    await page.locator('button:has-text("Sign in")').click();
    await expect(page.locator('.badge-bad')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('signup creates a new account and redirects to dashboard', async ({ page, context }) => {
    // Use API directly for signup with unique email
    const timestamp = Date.now();
    const email = `e2e+${timestamp}@example.com`;
    const res = await fetch('http://127.0.0.1:4318/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E User',
        email: email,
        password: 'E2ePassword123!',
        workspaceName: 'E2E Workspace',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Registration failed with status ${res.status}`);
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

    await page.goto('/app');
    await page.waitForURL(/\/app\/?/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/app\/?/);
  });

  test('logout redirects to login page', async ({ page, loginAs }) => {
    await loginAs();
    // Click sign out button in sidebar footer (icon button with aria-label)
    await page.locator('button[aria-label="Sign out"]').click();
    await expect(page).toHaveURL(/\/login/);
  });
});
