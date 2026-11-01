import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The devkit repo's own version (the playground links it via file:..).
const DEVKIT_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

// Exercises the devkit examples kit as a component consumes it. Runs against
// both the dev server ("dev" project) and the built examples site ("built").

test.describe('examples kit', () => {
  test('injects page config, styles, copy-links and chapter nav', async ({ page }) => {
    await page.goto('/examples-basic.html');

    const pageConfig = await page.evaluate(() => window.__KMWC__);
    expect(pageConfig?.id).toBe('web-playground');

    // Shared styles applied (base layer page background, light theme by default).
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 249, 250)');

    // One copy-link per section heading.
    await expect(page.locator('.card h2 .kmwc-copy-link')).toHaveCount(3);

    // Chapter nav: 3 chapters, labels free of the copy-link's "Copied!" text.
    const navItems = page.locator('.kmwc-chapter-nav__item');
    await expect(navItems).toHaveCount(3);
    await expect(navItems.first()).toHaveText('BU01 · Label & active state');
  });

  test('no FOUC: the kit styles apply without any script running', async ({ browser, baseURL }) => {
    // With JavaScript off, only render-blocking stylesheets can style the page —
    // a script-injected stylesheet would leave it unstyled here (and flash on reload).
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto('/examples-basic.html');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 249, 250)');
    await expect(page.locator('.container > header')).not.toHaveCSS('background-image', 'none');
    await context.close();
  });

  test('chapter nav opens, positions and jumps', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 500 });
    await page.goto('/examples-basic.html');
    await page.locator('.kmwc-chapter-nav__toggle').click();
    await expect(page.locator('.kmwc-chapter-nav')).toHaveClass(/kmwc-chapter-nav--open/);
    const panel = page.locator('.kmwc-chapter-nav__panel');
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    const toggleBox = await page.locator('.kmwc-chapter-nav__toggle').boundingBox();
    expect(panelBox && toggleBox && panelBox.x + panelBox.width <= toggleBox.x + 1).toBeTruthy(); // opens to the left of the tab

    await page.locator('.kmwc-chapter-nav__item', { hasText: 'BU02' }).click();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/#bu02-declarative-markup$/);
    await expect(page.locator('.kmwc-chapter-nav__item', { hasText: 'BU02' })).toHaveClass(/kmwc-chapter-nav__item--active/);
  });

  test('copy-link copies a deep link to the section', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    await page.goto('/examples-basic.html');
    const copyButton = page.locator('#bu01-label-active-state h2 .kmwc-copy-link');
    await page.locator('#bu01-label-active-state h2').hover();
    await copyButton.click();
    await expect(copyButton).toHaveClass(/kmwc-copy-link--copied/);
    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedUrl).toMatch(/\/examples-basic\.html#bu01-label-active-state$/);
  });

  test('spotlight searches every page by code or title and jumps (wcp keyboard map)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 500 }); // short: a jump must scroll
    await page.goto('/examples-basic.html');
    await expect(page.locator('.kmwc-spotlight__trigger')).toBeVisible(); // kit mounted
    const container = page.locator('.kmwc-spotlight__container');
    const input = page.locator('.kmwc-spotlight__input');
    const items = page.locator('.kmwc-spotlight__item');
    const activeItem = page.locator('.kmwc-spotlight__item--active');

    // Ctrl+K opens; the empty query lists this page first, then every other page.
    await page.keyboard.press('Control+k');
    await expect(container).toBeVisible();
    await expect(input).toBeFocused();
    await expect(page.locator('.kmwc-spotlight__home-heading').first()).toHaveText('Basic Usage · this page');
    await expect(items).toHaveCount(12);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden'); // body scroll locked

    // wcp keys: ↑ wraps to the end, PgDn steps 8, Home back to the top.
    await page.keyboard.press('ArrowUp');
    await expect(activeItem).toHaveAttribute('data-index', '11');
    await page.keyboard.press('Home');
    await page.keyboard.press('PageDown');
    await expect(activeItem).toHaveAttribute('data-index', '8');

    // An exact code ranks first, padding optional; text hits come from other pages too.
    await input.fill('th2');
    await expect(items.first()).toContainText('TH02');
    await input.fill('summary');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute('href', 'examples-devkit.html#summary');
    await expect(items.first().locator('mark')).toHaveText('Summary');
    await input.fill('no such chapter');
    await expect(page.locator('.kmwc-spotlight__empty')).toBeVisible();

    // Same page: Enter scrolls to the chapter by its short code link; focus and scroll come back.
    await input.fill('bu03');
    await page.keyboard.press('Enter');
    await expect(container).toBeHidden();
    await expect(page).toHaveURL(/examples-basic.html#bu03$/);
    await expect(page.locator('.kmwc-chapter-nav__item', { hasText: 'BU03' })).toHaveClass(/kmwc-chapter-nav__item--active/);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

    // Another page: the trigger button opens, ↓ picks, Enter navigates — the short link resolves on arrival.
    await page.locator('.kmwc-spotlight__trigger').click();
    await input.fill('dk');
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveClass(/kmwc-spotlight__item--active/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/examples-devkit.html#dk02$/);
    await expect(page.locator('.kmwc-spotlight__trigger')).toBeVisible(); // the new page's kit mounted
    await expect(page.locator('h2', { hasText: 'DK02' })).toBeInViewport();

    // Esc and a backdrop click close; Ctrl+K toggles.
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Escape');
    await expect(container).toBeHidden();
    await page.keyboard.press('Control+k');
    await page.locator('.kmwc-spotlight__backdrop').click({ position: { x: 10, y: 10 } });
    await expect(container).toBeHidden();
    await page.keyboard.press('Control+k');
    await expect(container).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(container).toBeHidden();
  });

  test('a short code link resolves on arrival (#th2 → TH02)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 500 });
    await page.goto('/examples-devkit.html#summary');
    await expect(page.locator('h2', { hasText: 'Summary' })).toBeInViewport();
    await page.goto('/examples-theming.html#th2');
    await expect(page.locator('h2', { hasText: 'TH02' })).toBeInViewport();
  });

  test('controls persistence restores and re-applies across reloads', async ({ page }) => {
    await page.goto('/examples-basic.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#bu-label').fill('Persisted!');
    await page.locator('#bu-active').check();
    await page.reload();
    await expect(page.locator('#bu-label')).toHaveValue('Persisted!');
    await expect(page.locator('#ex-basic .pg__label')).toHaveText('Persisted!');
    await expect(page.locator('#ex-basic')).toHaveAttribute('active', '');
    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(storageKeys).toContain('web-playground:examples:controls:basic');
  });

  test('index page renders from the registry, with cross-page nav', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.kmwc-index__header h1')).toHaveText('Web Playground');
    await expect(page.locator('.kmwc-index__card')).toHaveCount(3);
    await expect(page.locator('.kmwc-index__version')).toHaveText(/^v0\.1\.0/);
    // Footer: the devkit that built the page, next to the Keenmate / GitHub links.
    const devkitLink = page.locator('.kmwc-index__footer .kmwc-index__devkit');
    await expect(devkitLink).toHaveText(`web-components-devkit v${DEVKIT_VERSION}`);
    await expect(devkitLink).toHaveAttribute('href', 'https://github.com/keenmate/web-components');
    await expect(page.locator('.kmwc-chapter-nav__item')).toHaveCount(3);
    await expect(page.locator('.kmwc-copy-link')).toHaveCount(0);
  });

  test('theme tokens, local overrides and version badge', async ({ page }) => {
    await page.goto('/examples-devkit.html');
    // kmwc.theme.accentColor (#059669) → buttons + header gradient.
    await expect(page.locator('#accent-button')).toHaveCSS('background-color', 'rgb(5, 150, 105)');
    const headerBackground = await page.locator('header').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(headerBackground).toContain('rgb(5, 150, 105)');
    // Unlayered local CSS beats the layered kit.
    await expect(page.locator('#local-override')).toHaveCSS('color', 'rgb(200, 0, 0)');
    // Badge is stripped from the chapter label.
    await expect(page.locator('.kmwc-chapter-nav__item').first()).toHaveText('DK01 · Accent tokens');
    await expect(page.locator('#page-version')).toHaveText(/^v0\.1\.0/);
  });

  test('neutral fills keep their own text colour under a light primary', async ({ page }) => {
    await page.goto('/examples-devkit.html');
    // A light primary flips the on-accent text to black; the secondary button must not follow.
    const colors = await page.evaluate(() => {
      document.documentElement.style.setProperty('--kmwc-accent-color', '#fde047');
      const button = document.createElement('button');
      button.className = 'btn-secondary';
      document.body.append(button);
      return {
        onAccent: getComputedStyle(document.querySelector('header')!).color,
        onNeutral: getComputedStyle(button).color,
      };
    });
    expect(colors.onAccent).toBe('color(srgb 0 0 0)');
    expect(colors.onNeutral).toBe('color(srgb 1 1 1)');
  });

  test('theme switch cycles light → dark → auto, persists, and reaches the component', async ({ page }) => {
    await page.goto('/examples-devkit.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const html = page.locator('html');
    const themeSwitch = page.locator('.kmwc-theme-switch');
    const componentBackground = () => page.locator('#dk-component').evaluate((element) => getComputedStyle(element).backgroundColor);

    await expect(html).toHaveAttribute('data-theme', 'light');
    expect(await componentBackground()).toBe('rgb(255, 255, 255)');

    await themeSwitch.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 23, 42)');
    expect(await componentBackground()).toBe('rgb(30, 41, 59)'); // :host-context([data-theme="dark"])

    await page.reload(); // applied before first paint by the injected bootstrap script
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await themeSwitch.click();
    await expect(html).toHaveAttribute('data-theme', 'auto');
  });

  test('fragment pages get the shared layout', async ({ page }) => {
    await page.goto('/examples-devkit.html');
    await expect(page).toHaveTitle('Devkit kit — Web Playground');
    await expect(page.locator('.container > header h1')).toHaveText('Devkit kit');
    await expect(page.locator('.container > header .subtitle')).toHaveText(/^Layout, includes, demos/);
    await expect(page.locator('.container > header .back-link')).toHaveAttribute('href', 'index.html');
    await expect(page.locator('body')).toHaveClass('devkit-page');
    // <link> moved from the fragment into <head> (in a build Vite rewrites its
    // href to a hashed asset — the rule still applies, see the overrides test).
    await expect(page.locator('body link[rel="stylesheet"]')).toHaveCount(0);
    expect(await page.locator('head link[rel="stylesheet"]').count()).toBeGreaterThan(0);
  });

  test('includes: parameters, inner content, nesting, unknown placeholders kept', async ({ page }) => {
    await page.goto('/examples-devkit.html');
    const callout = page.locator('#callout-one');
    await expect(callout).toHaveCount(1);
    await expect(callout.locator('.note .note-title')).toHaveText('From a partial');
    await expect(callout.locator('.note')).toContainText('Inner content goes to {{content}}.');
    await expect(callout.locator('.unknown-placeholder')).toHaveText('{{notAParameter}}');
  });

  test('demos: live markup, generated code blocks, shown script runs, copy works', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    await page.goto('/examples-devkit.html');
    const demo = page.locator('.kmwc-demo').filter({ has: page.locator('#dk-demo') });
    const codeBlocks = demo.locator('.kmwc-demo__code code');
    await expect(codeBlocks).toHaveCount(2);
    await expect(codeBlocks.nth(0)).toHaveText('<web-playground id="dk-demo" label="Off"></web-playground>');
    await expect(codeBlocks.nth(1)).toContainText("const demo = document.getElementById('dk-demo');");
    await expect(codeBlocks.nth(1)).not.toContainText('data-kmwc-show');

    // The shown script is also the one that runs.
    await page.locator('#dk-demo .pg__root').click();
    await expect(page.locator('#dk-demo .pg__label')).toHaveText('On');

    await demo.locator('.kmwc-demo__copy').first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('<web-playground id="dk-demo" label="Off"></web-playground>');
  });

  test('test fixtures stay bare (no kit injected)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'dev', 'fixtures are not part of the built site');
    await page.goto('/test/fixture.html');
    await expect(page.locator('#subject .pg__label')).toHaveText('fixture');
    expect(await page.evaluate(() => window.__KMWC__)).toBeUndefined();
    await expect(page.locator('.kmwc-chapter-nav')).toHaveCount(0);
    await expect(page.locator('.kmwc-theme-switch')).toHaveCount(0);
  });
});

test.describe('built site only', () => {
  test('version badge carries the build stamp', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'built', 'build-only');
    await page.goto('/index.html');
    await expect(page.locator('.kmwc-index__version')).toHaveText(/^v0\.1\.0 \(built \d{4}-\d\d-\d\dT\d\d:\d\dZ\)$/);
  });
});
