import { test, expect } from '@playwright/test';

test.describe('<{{TAG}}>', () => {
  test('upgrades, renders its root and shows slotted content', async ({ page }) => {
    await page.goto('/test/fixture.html');
    await expect(page.locator('#subject .{{PREFIX}}__root')).toBeVisible();
    await expect(page.locator('#subject')).toHaveText('fixture');
    expect(await page.evaluate(() => !!customElements.get('{{TAG}}'))).toBe(true);
  });
});
