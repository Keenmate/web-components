import { test, expect, type Page } from '@playwright/test';

// Dark-mode signals (rulebook color-scheme.md): the page signal core mirrors onto the
// host as data-context-theme, a theme-source section, the per-instance data-theme
// attribute (wins over the page), and an inherited page color-scheme.
const getHostBackground = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor);
const DARK_BACKGROUND = 'rgb(30, 41, 59)';
const LIGHT_BACKGROUND = 'rgb(255, 255, 255)';

test.describe('<{{TAG}}> dark mode', () => {
  test('defaults to light, per-instance data-theme="dark" goes dark', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    expect(await getHostBackground(page, '#light-default')).toBe(LIGHT_BACKGROUND);
    expect(await getHostBackground(page, '#dark-instance')).toBe(DARK_BACKGROUND);
  });

  test('a dark page signal reaches the component live; per-instance data-theme="light" still wins', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.locator('#light-default')).toHaveAttribute('data-context-theme', 'dark');
    expect(await getHostBackground(page, '#light-default')).toBe(DARK_BACKGROUND);
    expect(await getHostBackground(page, '#light-instance')).toBe(LIGHT_BACKGROUND);
  });

  test('theme-source names the element whose theme it follows — not an ancestor, so only data-context-theme can reach it', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    await expect(page.locator('#dark-source')).toHaveAttribute('data-context-theme', 'dark');
    expect(await getHostBackground(page, '#dark-source')).toBe(DARK_BACKGROUND);
  });

  test('a page color-scheme of dark is inherited', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    await page.evaluate(() => (document.documentElement.style.colorScheme = 'dark'));
    expect(await getHostBackground(page, '#light-default')).toBe(DARK_BACKGROUND);
  });

  test('--base-* themes the component', async ({ page }) => {
    await page.goto('/test/dark-mode.html');
    expect(await getHostBackground(page, '#base-themed')).toBe('rgb(255, 0, 0)');
  });
});
