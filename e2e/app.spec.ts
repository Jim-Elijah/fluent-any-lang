import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('loads the home page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('FluentAnyLang');
    await expect(page.locator('app-shell')).toBeVisible();
  });
});
