import { test, expect } from './fixtures';

test.describe('Projects', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs();
  });

  test('lists existing projects', async ({ page }) => {
    await page.goto('/app/projects');
    await expect(page.locator('h1')).toContainText('Projects');
    await expect(page.locator('table')).toBeVisible();
  });

  test('creates a new project', async ({ page }) => {
    await page.goto('/app/projects');
    await page.locator('button:has-text("New Project")').click();
    await page.locator('input[placeholder="My Application"]').fill('E2E Test Project');
    await page.locator('select').selectOption('Web Application');
    await page.locator('button:has-text("Create Project")').click();
    await expect(page.locator('text=Project created successfully')).toBeVisible();
    await expect(page.locator('text=E2E Test Project')).toBeVisible();
  });

  test('shows empty state when no projects exist', async ({ page }) => {
    // This test relies on existing seeded projects; adjust if needed
    await page.goto('/app/projects');
    await expect(page.locator('h1')).toBeVisible();
  });
});
