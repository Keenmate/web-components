import { test, expect, type Page } from '@playwright/test';

// Dark-mode signals (rulebook color-scheme.md): page color-scheme, framework
// class on an ancestor, and the per-instance data-theme attribute.
const getHostBackground = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor);

test.describe('<{{TAG}}> dark mode', () => {
  test('defaults to light, per-instance data-theme="dark" goes dark', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    expect(await getHostBackground(page, '#light-default')).toBe('rgb(255, 255, 255)');
    expect(await getHostBackground(page, '#dark-instance')).toBe('rgb(26, 26, 26)');
  });

  test('an ancestor data-theme="dark" reaches the component', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    expect(await getHostBackground(page, '#dark-ancestor')).toBe('rgb(26, 26, 26)');
  });

  test('a page color-scheme of dark is inherited', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    await page.evaluate(() => (document.documentElement.style.colorScheme = 'dark'));
    expect(await getHostBackground(page, '#light-default')).toBe('rgb(26, 26, 26)');
  });

  test('--base-* themes the component', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    expect(await getHostBackground(page, '#base-themed')).toBe('rgb(255, 0, 0)');
  });
});
