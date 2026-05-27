import { test, expect } from '@playwright/test';

test.describe('Boilerplate Dashboard Health Check', () => {
  test('should display dashboard title and connect button', async ({ page }) => {
    await page.goto('/');
    
    // Expect dashboard title to be visible
    await expect(page.getByTestId('title')).toHaveText('Boilerplate Dashboard');
    
    // Expect reload/check button to be visible
    await expect(page.getByTestId('reload-btn')).toBeVisible();
    await expect(page.getByTestId('reload-btn')).toContainText('Check Connection');
  });
});
