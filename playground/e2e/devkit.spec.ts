import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
    await expect(items).toHaveCount(38);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden'); // body scroll locked

    // wcp keys: ↑ wraps to the end, PgDn steps 8, Home back to the top.
    await page.keyboard.press('ArrowUp');
    await expect(activeItem).toHaveAttribute('data-index', '37');
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
    await expect(page.locator('.kmwc-index__card')).toHaveCount(6);
    await expect(page.locator('.kmwc-index__version')).toHaveText(/^v0\.1\.0/);
    // Footer: the devkit that built the page, next to the Keenmate / GitHub links.
    const devkitLink = page.locator('.kmwc-index__footer .kmwc-index__devkit');
    await expect(devkitLink).toHaveText(`web-components-devkit v${DEVKIT_VERSION}`);
    await expect(devkitLink).toHaveAttribute('href', 'https://github.com/keenmate/web-components');
    await expect(page.locator('.kmwc-chapter-nav__item')).toHaveCount(6);
    await expect(page.locator('.kmwc-copy-link')).toHaveCount(0);
  });

  test('form controls: one height, accent states, opt-out with .kmwc-native', async ({ page }) => {
    await page.goto('/examples-forms.html');
    // A page's own row (no .controls): buttons, select and input line up at --kmwc-control-height.
    const heights = await page.locator('#fc-row').evaluate((row) =>
      [...row.querySelectorAll('button, select, input')].map((element) => element.getBoundingClientRect().height));
    expect(new Set(heights)).toEqual(new Set([36]));
    await expect(page.locator('#fc-row')).toHaveCSS('display', 'flex'); // examples-local.css is linked
    // Checked checkbox / switch fill with the accent (kmwc.theme.accentColor #059669).
    await expect(page.locator('.card').nth(3).locator('input:checked:not(:disabled)')).toHaveCSS('background-color', 'rgb(5, 150, 105)');
    await expect(page.locator('#fc-indeterminate')).toHaveCSS('background-color', 'rgb(5, 150, 105)');
    await expect(page.locator('input[role="switch"]:checked')).toHaveCSS('background-color', 'rgb(5, 150, 105)');
    // Focus: accent border.
    await page.locator('#fc-text').focus();
    await expect(page.locator('#fc-text')).toHaveCSS('border-top-color', 'rgb(5, 150, 105)');
    // .kmwc-native keeps the browser's controls.
    await expect(page.locator('.kmwc-native input[type="checkbox"]')).toHaveCSS('appearance', 'auto');
    await expect(page.locator('.kmwc-native select')).not.toHaveCSS('height', '36px');
    // The scaffold component's CSS no longer resets box-sizing on the page.
    await expect(page.locator('.card').first()).toHaveCSS('box-sizing', 'border-box');
  });

  test('tables: any table styled, modifiers, compact controls, opt-out', async ({ page }) => {
    await page.goto('/examples-tables.html');
    const headerFill = await page.locator('#tb-bare th').first().evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(headerFill).not.toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('#tb-bare td').first()).toHaveCSS('border-bottom-style', 'solid');
    await expect(page.locator('#tb-bare td.num').first()).toHaveCSS('text-align', 'end');
    // .reference-table keeps its full width and boxed cells.
    const widths = await page.locator('#tb-reference').evaluate((table) => {
      const style = getComputedStyle(table.parentElement!);
      return [table.getBoundingClientRect().width, table.parentElement!.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)];
    });
    expect(Math.abs(widths[0] - widths[1])).toBeLessThan(1);
    await expect(page.locator('#tb-reference td').first()).toHaveCSS('border-left-style', 'solid');
    // .table-compact lowers the control height for the controls in it.
    for (const selector of ['input[type="text"]', 'select', 'button']) {
      await expect(page.locator(`#tb-compact ${selector}`).first()).toHaveCSS('height', '28px');
    }
    // kmwc-native: no kit fill.
    await expect(page.locator('table.kmwc-native th').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('widgets: log panels, event log, pills, status dots, CSS-variable readout', async ({ page }) => {
    await page.goto('/examples-widgets.html');
    // Light and dark log panels differ; the dark one is the console background.
    const backgrounds = await page.evaluate(() => ['wg-log-light', 'wg-log-dark', 'wg-event-log'].map((id) =>
      getComputedStyle(document.getElementById(id)!).backgroundColor));
    expect(backgrounds[0]).not.toBe(backgrounds[1]);
    expect(backgrounds[2]).toBe(backgrounds[1]);
    // The legacy .event-log is a .log-panel--dark: same text colour, size and timeline rows.
    for (const property of ['color', 'font-size', 'padding-left'] as const) {
      const [panelValue, eventLogValue] = await page.evaluate((name) => ['wg-log-dark', 'wg-event-log'].map((id) =>
        getComputedStyle(document.getElementById(id)!)[name]), property);
      expect(eventLogValue, property).toBe(panelValue);
    }
    await expect(page.locator('#wg-event-log .event-entry').first()).toHaveCSS('display', 'flex');
    const detailLefts = await page.locator('#wg-event-log .event-name').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().left));
    expect(new Set(detailLefts).size).toBe(1); // the time column has one width
    // A wrapped detail stays in its column: the warn entry is taller, the time cell keeps one line.
    const warnEntry = page.locator('#wg-event-log .event-entry.log-line--warn');
    const timeHeight = await warnEntry.locator('.event-time').evaluate((cell) => cell.getBoundingClientRect().height);
    expect(timeHeight).toBeLessThan(25);
    await expect(warnEntry.locator('.event-name')).toHaveCSS('color', 'rgb(252, 211, 77)');
    await expect(page.locator('#wg-log-light')).toHaveCSS('overflow-y', 'auto');
    // Each pill / dot tone is its own colour.
    const pillColors = await page.locator('#wg-pills .pill').evaluateAll((pills) => pills.map((pill) => getComputedStyle(pill).color));
    expect(new Set(pillColors).size).toBe(5); // --muted is the neutral default
    const dotColors = await page.locator('#wg-dots .status-dot').evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot).backgroundColor));
    expect(new Set(dotColors).size).toBe(5);
    // The sliders restyle the box and the readout follows.
    await expect(page.locator('#wg-sliders')).toHaveCSS('display', 'grid');
    await page.locator('#wg-padding').fill('30');
    await expect(page.locator('#wg-padding-value')).toHaveText('30px');
    await expect(page.locator('#wg-box')).toHaveCSS('padding-left', '30px');
    await expect(page.locator('#wg-inner')).toHaveText(/^\d+px$/);
  });

  test('log lines: tones per theme, indentation, timeline columns, text log and empty placeholder', async ({ page }) => {
    await page.goto('/examples-widgets.html');
    const toneColors = (panelId: string) => page.locator(`#${panelId} .log-line`).evaluateAll((lines) =>
      lines.map((line) => getComputedStyle(line).color));
    // Five tones plus the untoned lines: every tone its own colour, on both panels.
    for (const panelId of ['wg-log-light', 'wg-log-dark']) {
      expect(new Set(await toneColors(panelId)).size).toBe(6);
    }
    // The dark panel uses the console tints, not the light theme's dark text.
    const [lightWarn, darkWarn] = await Promise.all(['wg-log-light', 'wg-log-dark'].map((panelId) =>
      page.locator(`#${panelId} .log-line--warn`).evaluate((line) => getComputedStyle(line).color)));
    expect(lightWarn).not.toBe(darkWarn);
    expect(darkWarn).toBe('rgb(252, 211, 77)');
    // Indentation survives; the action line is bold.
    await expect(page.locator('#wg-log-light .log-line').nth(2)).toHaveCSS('white-space', 'pre-wrap');
    await expect(page.locator('#wg-log-light .log-line--action')).toHaveCSS('font-weight', '600');
    // Timeline: a line with cells is a row; the name takes the line's tone; the panel grows.
    const timelineLine = page.locator('#wg-timeline .log-line').nth(2);
    await expect(timelineLine).toHaveCSS('display', 'flex');
    await expect(page.locator('#wg-timeline .log-line--action')).toHaveCSS('display', 'block');
    const nameColor = await timelineLine.locator('.log-line__name').evaluate((cell) => getComputedStyle(cell).color);
    expect(nameColor).toBe(await timelineLine.evaluate((line) => getComputedStyle(line).color));
    await expect(page.locator('#wg-timeline')).toHaveCSS('max-height', 'none');
    const seqLefts = await page.locator('#wg-timeline .log-line__time').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().left));
    expect(new Set(seqLefts).size).toBe(1); // the columns line up
    // On a wide screen the detail sits beside the cells.
    const hookLine = page.locator('#wg-timeline .log-line--info');
    const besideTops = await hookLine.evaluate((line) => [line.querySelector('.log-line__name')!, line.lastElementChild!].map((cell) => cell.getBoundingClientRect().top));
    expect(besideTops[1]).toBe(besideTops[0]);
    // A text log keeps its line breaks; the placeholder shows only while empty.
    const textLog = page.locator('#wg-text-log');
    const placeholder = () => textLog.evaluate((log) => getComputedStyle(log, '::before').content);
    expect(await placeholder()).toBe('"(nothing yet)"');
    await page.locator('#wg-text-append').click();
    await expect(textLog).toContainText('  width:');
    expect(await placeholder()).toBe('none');
    const lineHeight = await textLog.evaluate((log) => parseFloat(getComputedStyle(log).lineHeight));
    const textHeight = await textLog.evaluate((log) => log.scrollHeight - parseFloat(getComputedStyle(log).paddingTop) * 2);
    expect(Math.round(textHeight / lineHeight)).toBe(2);
    // .mono: the monospace font without the code chip.
    const monoFont = await page.locator('#wg-mono').evaluate((element) => getComputedStyle(element).fontFamily);
    expect(monoFont).toBe(await page.locator('#wg-json').evaluate((element) => getComputedStyle(element).fontFamily));
    expect(monoFont).not.toBe(await page.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily));
  });

  test('check list and a highlighted table cell', async ({ page }) => {
    await page.goto('/examples-forms.html');
    const boxes = await page.locator('#fc-check-list input').evaluateAll((inputs) => inputs.map((input) => input.getBoundingClientRect().left));
    expect(new Set(boxes).size).toBe(1); // one per line, aligned
    const rows = await page.locator('#fc-check-list > label').evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().top));
    expect(rows[0]).toBeLessThan(rows[1]);
    await page.goto('/examples-tables.html');
    const highlighted = await page.locator('#tb-cell td.is-highlight').first().evaluate((cell) => getComputedStyle(cell).backgroundColor);
    const plain = await page.locator('#tb-cell td:not(.is-highlight)').nth(1).evaluate((cell) => getComputedStyle(cell).backgroundColor);
    expect(highlighted).not.toBe(plain);
  });

  test('on a phone no example page is wider than the screen (tables scroll in their card)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const pageName of ['examples-basic', 'examples-theming', 'examples-devkit', 'examples-forms', 'examples-tables', 'examples-widgets']) {
      await page.goto(`/${pageName}.html`);
      await expect(page.locator('.kmwc-spotlight__trigger')).toBeVisible();
      const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(widths[0], `${pageName} is wider than the phone`).toBeLessThanOrEqual(widths[1]);
    }
    await page.goto('/examples-tables.html');
    await expect(page.locator('#tb-striped')).toHaveCSS('overflow-x', 'auto');
  });

  test('on a phone a wide pre in a grid item and long code in a .controls button stay inside the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/examples-basic.html');
    await expect(page.locator('.kmwc-spotlight__trigger')).toBeVisible();
    const longCode = 'element.setAttribute("a-very-long-attribute-name", "a-very-long-attribute-value")';
    await page.evaluate((code) => {
      const card = document.querySelector('.card')!;
      for (const gridClass of ['grid', 'grid-2', 'card-grid']) {
        card.insertAdjacentHTML('beforeend', `<div class="${gridClass}"><div><pre>${code} ${code}</pre></div></div>`);
      }
      card.insertAdjacentHTML('beforeend', `<div class="controls"><button type="button"><code>${code.replaceAll(' ', '')}</code></button></div>`);
    }, longCode);
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
  });

  test('on a phone a timeline detail drops under its cells instead of being squeezed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/examples-widgets.html');
    const hookLine = page.locator('#wg-timeline .log-line--info'); // long source name
    const [nameBox, detailBox, lineBox] = await hookLine.evaluate((line) =>
      [line.querySelector('.log-line__name')!, line.lastElementChild!, line].map((element) => element.getBoundingClientRect().toJSON()));
    expect(detailBox.top).toBeGreaterThanOrEqual(nameBox.bottom); // its own line
    expect(detailBox.width).toBeGreaterThan(lineBox.width * 0.9); // at full width
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
  });

  test('at 320px long inline code breaks instead of widening any page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    for (const pageName of ['examples-basic', 'examples-theming', 'examples-devkit', 'examples-forms', 'examples-tables', 'examples-widgets']) {
      await page.goto(`/${pageName}.html`);
      await expect(page.locator('.kmwc-spotlight__trigger')).toBeVisible();
      // A heading and a paragraph with one long identifier each (no break opportunity).
      // A heading naming an API outside <code>, and a 250px widget (an inline calendar) in a
      // demo card's demo area — two boxes deep inside the card.
      await page.evaluate(() => document.querySelector('.card')!.insertAdjacentHTML('afterbegin',
        '<h2><code>resolvePresentation(mode,environment,map)</code></h2><p><code>window.components.renderLoaderCallback</code></p>' +
          '<h2>EV05 · getMonthDataCallback&amp;beforeMonthChangeCallback</h2>' +
          '<div class="demo-card"><div class="demo-area"><div style="width: 250px; height: 4px"></div></div></div>'));
      const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(widths[0], `${pageName} is wider than 320px`).toBeLessThanOrEqual(widths[1]);
    }
    // Code in a pre keeps its lines (the pre scrolls instead).
    await expect(page.locator('pre code').first()).toHaveCSS('overflow-wrap', 'normal');
  });

  test('keys, search matches, field widths, push-end and the readout spacing', async ({ page }) => {
    await page.goto('/examples-widgets.html');
    const key = page.locator('#wg-keys kbd').first();
    await expect(key).toHaveCSS('border-bottom-width', '2px');
    await expect(key).toHaveCSS('font-weight', '600');
    const mark = page.locator('#wg-mark mark').first();
    await expect(mark).toHaveCSS('font-weight', '600');
    await expect(mark).toHaveCSS('padding-left', '0px'); // a match inside a word doesn't split it
    expect(await mark.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 255, 0)'); // not the browser yellow
    // The spotlight's own key hint keeps its look (its class wins over the kit's kbd).
    await expect(page.locator('.kmwc-spotlight__trigger-key')).toHaveCSS('border-bottom-width', '1px');
    await expect(page.locator('#wg-readout')).toHaveCSS('margin-top', '12px');

    await page.goto('/examples-forms.html');
    const widthOf = (selector: string) => page.locator(selector).evaluate((element) => element.getBoundingClientRect().width);
    expect(await widthOf('#fc-width-number')).toBe(112); // 7rem
    expect(await widthOf('#fc-width-xs')).toBe(64);
    expect(await widthOf('#fc-width-md')).toBe(144);
    expect(await widthOf('#fc-width-select')).toBe(96);
    expect(await widthOf('#fc-name')).toBeGreaterThan(200); // a form group still stretches its field
    const [rowRight, buttonRight] = await page.evaluate(() => [
      document.getElementById('fc-widths')!.getBoundingClientRect().right,
      document.getElementById('fc-push-end')!.getBoundingClientRect().right,
    ]);
    expect(Math.round(buttonRight)).toBe(Math.round(rowRight));
  });

  test('every log tone on both panels passes WCAG AA (4.5:1) in both themes', async ({ page }) => {
    await page.goto('/examples-widgets.html');
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      const ratios = await page.evaluate(() => {
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        const getRgb = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
        };
        const getLuminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map((channel) => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const getRatio = (foreground: string, background: string) => {
          const [lighter, darker] = [getLuminance(getRgb(foreground)), getLuminance(getRgb(background))].sort((a, b) => b - a);
          return (lighter + 0.05) / (darker + 0.05);
        };
        const results: Record<string, number> = {};
        for (const panelId of ['wg-log-light', 'wg-log-dark']) {
          const panel = document.getElementById(panelId)!;
          const background = getComputedStyle(panel).backgroundColor;
          for (const line of panel.querySelectorAll('.log-line')) {
            results[`${panelId} ${line.className}`] = getRatio(getComputedStyle(line).color, background);
          }
        }
        return results;
      });
      for (const [line, ratio] of Object.entries(ratios)) expect(ratio, `${colorScheme}: ${line}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('dark mode: inline code passes WCAG AA (4.5:1) on its chip whatever the accent', async ({ page }) => {
    await page.goto('/examples-devkit.html');
    // treeview's mid-dark green read at ~3:1 on the old neutral #2b2b2b chip; navy is the hard case.
    for (const accentColor of ['', '#059669', '#1e3a8a', '#fbbf24']) {
      const ratio = await page.evaluate((accent) => {
        const root = document.documentElement;
        root.setAttribute('data-theme', 'dark');
        if (accent) root.style.setProperty('--kmwc-accent-color', accent);
        else root.style.removeProperty('--kmwc-accent-color');
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        const getLuminance = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3)).map((channel) => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const code = document.querySelector('.card p code')!;
        const [lighter, darker] = [getLuminance(getComputedStyle(code).color), getLuminance(getComputedStyle(code).backgroundColor)].sort((a, b) => b - a);
        return (lighter + 0.05) / (darker + 0.05);
      }, accentColor);
      expect(ratio, `accent ${accentColor || 'site default'}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the control height leaves the kit copy buttons small', async ({ page }) => {
    await page.goto('/examples-devkit.html');
    const copyLinkHeight = await page.locator('.kmwc-copy-link').first().evaluate((element) => element.getBoundingClientRect().height);
    const demoCopyHeight = await page.locator('.kmwc-demo__copy').first().evaluate((element) => element.getBoundingClientRect().height);
    expect(copyLinkHeight).toBeLessThan(30);
    expect(demoCopyHeight).toBeLessThan(30);
  });

  test('form controls and tables follow a --base-* theme', async ({ page }) => {
    await page.goto('/examples-forms.html');
    await page.evaluate(() => {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--base-input-border-color', '#ff8800');
      rootStyle.setProperty('--base-input-bg', '#fffbeb');
    });
    await expect(page.locator('#fc-search')).toHaveCSS('border-top-color', 'rgb(255, 136, 0)');
    await expect(page.locator('#fc-search')).toHaveCSS('background-color', 'rgb(255, 251, 235)');
    // (The accent is the site's kmwc.theme.accentColor here, which wins over --base-primary-color.)
    // Dark mode: fields sit on the dark input surface, not the light default.
    await page.evaluate(() => {
      document.documentElement.removeAttribute('style');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await expect(page.locator('#fc-search')).toHaveCSS('background-color', 'rgb(30, 41, 59)');
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
    // kmwc.theme styles the demo UI only: the component keeps the contract's default accent.
    const componentAccent = await page.locator('#dk-component').evaluate((element) => getComputedStyle(element).getPropertyValue('--pg-accent-color').trim());
    expect(componentAccent).toBe('#3b82f6');
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

test.describe('kmwc check-pages', () => {
  // The CLI itself, against this project's server (dev, or the built site): every
  // playground page is clean at a phone width. (Catching problems is unit-tested via getPageProblems.)
  test('reports every playground page clean at 320px', async ({ baseURL }) => {
    test.setTimeout(120_000);
    const devkitCli = fileURLToPath(new URL('../../src/cli/kmwc.js', import.meta.url));
    const playgroundRoot = fileURLToPath(new URL('..', import.meta.url));
    const result = spawnSync(process.execPath, [devkitCli, 'check-pages', '--url', baseURL!, '--widths', '320', '--root', playgroundRoot], { encoding: 'utf8' });
    expect(result.stdout).toContain('✓ examples-widgets.html');
    expect(result.stdout).toContain('✓ 0 problem(s)');
    expect(result.status).toBe(0);
  });
});
