import { test, expect } from '@playwright/test';

test.describe('play page', () => {
  test('loads join form for a room', async ({ page }) => {
    await page.goto('/play/test-room-123');
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // Join form or connecting state
    await expect(body).toContainText(/Join|Enter your name|Connecting|room/i);
  });
});
