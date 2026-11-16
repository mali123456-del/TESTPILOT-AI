import { test, expect } from './fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs();
  });

  test('shows quality overview with real metrics', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Quality overview');
    await expect(page.locator('text=Release readiness')).toBeVisible();
    await expect(page.locator('text=Pass rate')).toBeVisible();
    await expect(page.locator('text=Open defects')).toBeVisible();
    await expect(page.locator('text=Flaky cases')).toBeVisible();
    await expect(page.locator('text=Case coverage')).toBeVisible();
  });

  test('shows recent runs table', async ({ page }) => {
    await expect(page.locator('text=Recent runs')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('navigates to projects page', async ({ page }) => {
    await page.locator('nav-link:has-text("Projects")').click();
    await expect(page).toHaveURL(/\/app\/projects/);
    await expect(page.locator('h1')).toContainText('Projects');
  });

  test('navigates to execution center (runs)', async ({ page }) => {
    await page.locator('nav-link:has-text("Execution center")').click();
    await expect(page).toHaveURL(/\/app\/runs/);
  });

  test('navigates to AI assistant', async ({ page }) => {
    await page.locator('nav-link:has-text("AI assistant")').click();
    await expect(page).toHaveURL(/\/app\/assistant/);
  });

  test('opens command palette with Ctrl+K', async ({ page }) => {
    await page.press('body', 'Control+K');
    await expect(page.locator('.palette-input')).toBeVisible();
    await page.press('body', 'Escape');
    await expect(page.locator('.palette-input')).not.toBeVisible();
  });
});
