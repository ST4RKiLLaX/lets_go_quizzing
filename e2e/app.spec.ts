import { test, expect } from '@playwright/test';

test.describe('app', () => {
  test('loads and shows setup or home', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // Either setup page ("Complete setup") or home page ("Let's Go Quizzing" / "Choose a quiz")
    await expect(body).toContainText(/Let's Go Quizzing|Complete setup|Choose a quiz/i);
  });
});
