/**
 * kmwc check-pages — load every example page in a real browser and report what
 * a reader would hit: page errors, console errors, failed requests, custom
 * elements that never get defined, a page wider than the viewport (a fixed
 * width or a long word that pushes a phone sideways), and page CSS that can
 * never apply because what it targets lives only inside a shadow root (classes
 * a render callback puts into the component).
 *
 * Runs against the repo's own dev server (started here on kmwc.ports.dev), or a
 * server you already have (--url, e.g. the built site on the preview port).
 * Widths default to desktop + two phones. Uses the component's own
 * @playwright/test (see getPeerModule) — `npx playwright install chromium` once.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getKmwcConfig, getPeerModule, loadPeerModule } from '../../config.js';
import { getExamplePages } from '../../vite/index.js';
import { getRuleSelectors } from '../repo-checks.js';

export const DEFAULT_WIDTHS = [1440, 390, 320];
const VIEWPORT_HEIGHT = 900;
const SETTLE_MS = 600;
const VITE_CONFIG_FILES = ['vite.config.ts', 'vite.config.mts', 'vite.config.mjs', 'vite.config.js'];
const MAX_OFFENDERS = 3;
const LOCAL_STYLESHEET_FILE = 'examples-local.css';
// Requests a page doesn't control (favicon probes, analytics in a built site).
const IGNORED_REQUEST_PATTERN = /favicon\.ico|stats\.keenmate\.services|plausible/;

/** `--widths 1440,390` → [1440, 390]. Pure. */
export function parseWidths(widthsText) {
  if (!widthsText) return DEFAULT_WIDTHS;
  const widths = String(widthsText).split(',').map((width) => Number(width.trim()));
  if (!widths.length || widths.some((width) => !Number.isInteger(width) || width < 200)) throw new Error(`--widths: "${widthsText}" is not a list of pixel widths ≥ 200`);
  return widths;
}

/**
 * The element a selector styles, as a selector of its own: the last compound with
 * pseudo-classes / -elements dropped (`.tree .badge:hover::after` → `.badge`), or
 * null when there's no class / id / attribute to look for (`:root`, `div`, `from`). Pure.
 */
export function getSelectorSubject(selector) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    else if (depth === 0 && /[\s>+~]/.test(character)) start = index + 1;
  }
  const subject = selector.slice(start).replace(/::?[\w-]+(\([^()]*\))?/g, '').trim();
  return /[.#[]/.test(subject) ? subject : null;
}

/** A page's own CSS rules (its `<style>` blocks + examples-local.css) → [{ selector, subject }]. */
export function loadPageRules(root, pagePath) {
  const pageText = readFileSync(pagePath, 'utf8');
  const localStylesheetPath = join(root, LOCAL_STYLESHEET_FILE);
  const styleText = [
    ...[...pageText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
    existsSync(localStylesheetPath) ? readFileSync(localStylesheetPath, 'utf8') : '',
  ].join('\n');
  const selectors = [...new Set(getRuleSelectors(styleText))];
  return selectors.map((selector) => ({ selector, subject: getSelectorSubject(selector) })).filter((rule) => rule.subject);
}

/**
 * Runs in the page: page rules whose subject matches nothing in the document but
 * something inside a shadow root → [{ selector, host }]. Page CSS stops at the
 * shadow boundary, so such a rule never applies.
 */
export function findShadowOnlyRules(rules) {
  const getShadowRoots = (root) =>
    [...root.querySelectorAll('*')].filter((element) => element.shadowRoot).flatMap((element) => [element.shadowRoot, ...getShadowRoots(element.shadowRoot)]);
  const shadowRoots = getShadowRoots(document);
  const safeQuery = (root, selector) => {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  };
  return rules.flatMap(({ selector, subject }) => {
    if (safeQuery(document, subject)) return [];
    const shadowRoot = shadowRoots.find((root) => safeQuery(root, subject));
    return shadowRoot ? [{ selector, host: shadowRoot.host.localName }] : [];
  });
}

/**
 * Problems in one page load's report → [string]. Pure — exported for tests.
 * @param {{ width: number, errors: string[], undefinedElements: string[], scrollWidth: number, clientWidth: number, offenders: string[], shadowOnlyRules?: { selector: string, host: string }[] }} pageReport
 */
export function getPageProblems(pageReport) {
  const problems = [...pageReport.errors];
  for (const { selector, host } of pageReport.shadowOnlyRules || []) {
    problems.push(`page CSS "${selector}" only matches inside <${host}>'s shadow root — page styles can't reach it (use a CSS variable, ::part or the component's styles hook)`);
  }
  if (pageReport.undefinedElements.length) problems.push(`never defined: <${pageReport.undefinedElements.join('>, <')}>`);
  if (pageReport.scrollWidth > pageReport.clientWidth) {
    const offenderText = pageReport.offenders.length ? ` — widest: ${pageReport.offenders.join(', ')}` : '';
    problems.push(`page is ${pageReport.scrollWidth}px wide in a ${pageReport.clientWidth}px viewport${offenderText}`);
  }
  return problems;
}

/**
 * Runs in the page: overflow, undefined custom elements. A culprit is the deepest
 * element — or the text — past the right edge, outside anything that scrolls or
 * clips on purpose (a code block, a table wrapper) and outside hidden or fixed
 * layers (a closed nav panel, a toast), which don't widen the page.
 */
function inspectPage(maxOffenders) {
  const viewportWidth = document.documentElement.clientWidth;
  // Shadow roots count: a component's own internals can widen the page too.
  const getParent = (element) => element.parentElement || element.getRootNode().host || null;
  const describeOne = (element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList].slice(0, 2).map((name) => `.${name}`).join('')}`;
  const describe = (element) => {
    const host = element.getRootNode().host;
    return host ? `${describe(host)} › ${describeOne(element)}` : describeOne(element);
  };
  const getAllElements = (root) => [...root.querySelectorAll('*')].flatMap((element) => (element.shadowRoot ? [element, ...getAllElements(element.shadowRoot)] : [element]));
  const checkIsContained = (element) => {
    for (let current = element; current && current !== document.body; current = getParent(current)) {
      const style = getComputedStyle(current);
      if (style.position === 'fixed' || style.visibility === 'hidden' || style.display === 'none') return true;
      if (current !== element && ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) return true;
    }
    return false;
  };
  const allElements = getAllElements(document.body);
  const pastEdge = allElements.filter((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.right > viewportWidth + 1 && !checkIsContained(element);
  });
  const checkContainsDeep = (element, other) => {
    for (let current = other; current; current = getParent(current)) if (current === element) return true;
    return false;
  };
  const offenders = pastEdge.filter((element) => !pastEdge.some((other) => other !== element && checkContainsDeep(element, other))).map(describe);
  // Text past the edge inside a box that fits: a long word with no break opportunity.
  const textRoots = [document.body, ...allElements.filter((element) => element.shadowRoot).map((element) => element.shadowRoot)];
  const textNodes = textRoots.flatMap((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  });
  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (!textNode.textContent.trim() || !parent || pastEdge.includes(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const box = range.getBoundingClientRect();
    const parentStyle = getComputedStyle(parent);
    if (box.right > viewportWidth + 1 && !['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowX) && !checkIsContained(parent)) {
      offenders.push(`${describe(parent)} "${textNode.textContent.trim().slice(0, 40)}"`);
    }
  }
  const undefinedElements = [...new Set([...document.querySelectorAll(':not(:defined)')].map((element) => element.localName).filter((name) => name.includes('-')))];
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: viewportWidth,
    offenders: [...new Set(offenders)].slice(0, maxOffenders),
    undefinedElements,
  };
}

async function loadPageReport(browser, pageUrl, width, pageRules = []) {
  const page = await browser.newPage({ viewport: { width, height: VIEWPORT_HEIGHT } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page error: ${error.message.split('\n')[0]}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console error: ${message.text().split('\n')[0]}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !IGNORED_REQUEST_PATTERN.test(response.url())) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (!IGNORED_REQUEST_PATTERN.test(request.url())) errors.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MS);
    const inspection = await page.evaluate(inspectPage, MAX_OFFENDERS);
    const shadowOnlyRules = pageRules.length ? await page.evaluate(findShadowOnlyRules, pageRules) : [];
    return { width, errors: [...new Set(errors)], ...inspection, shadowOnlyRules };
  } catch (error) {
    return { width, errors: [...new Set([...errors, `load failed: ${error.message.split('\n')[0]}`])], scrollWidth: 0, clientWidth: 0, offenders: [], undefinedElements: [] };
  } finally {
    await page.close();
  }
}

async function startDevServer(config) {
  const viteModule = await loadPeerModule(config.root, 'vite');
  // Vite < 6 resolves to its CJS build here: the API sits on `default`.
  const createServer = viteModule.createServer || viteModule.default?.createServer;
  // Run like `npm run dev` in the repo: the preset reads package.json#kmwc from the cwd,
  // and Vite looks for vite.config there too.
  process.chdir(config.root);
  const configFile = VITE_CONFIG_FILES.map((fileName) => join(config.root, fileName)).find((filePath) => existsSync(filePath));
  const server = await createServer({ root: config.root, configFile: configFile || false, logLevel: 'error', server: { port: config.ports.dev, strictPort: true } });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw new Error(
      `port ${config.ports.dev} is busy (${error.code || error.message}). If that is this repo's dev server, run: kmwc check-pages --url http://localhost:${config.ports.dev}`
    );
  }
  return server;
}

export async function run(args) {
  const config = getKmwcConfig(args.root);
  const widths = parseWidths(args.widths);
  const pagePaths = Object.values(getExamplePages(config));
  const pageFiles = pagePaths.map((pagePath) => pagePath.replace(/\\/g, '/').split('/').pop());
  if (!pageFiles.length) {
    console.log('kmwc check-pages: no example pages — nothing to check.');
    return 0;
  }
  let chromium;
  try {
    ({ chromium } = getPeerModule(config.root, '@playwright/test'));
  } catch {
    throw new Error('@playwright/test is not installed in this repo — npm i -D @playwright/test && npx playwright install chromium');
  }

  const server = args.url ? null : await startDevServer(config);
  const baseUrl = (args.url || `http://localhost:${config.ports.dev}`).replace(/\/$/, '');
  const browser = await chromium.launch();
  let problemCount = 0;
  try {
    console.log(`kmwc check-pages — ${pageFiles.length} page(s) × ${widths.join(' / ')}px on ${baseUrl}\n`);
    for (const [pageIndex, pageFile] of pageFiles.entries()) {
      const pageProblems = [];
      const pageRules = loadPageRules(config.root, pagePaths[pageIndex]);
      for (const [widthIndex, width] of widths.entries()) {
        // Shadow-only rules don't depend on the width: check them on the first load only.
        const report = await loadPageReport(browser, `${baseUrl}/${pageFile}`, width, widthIndex === 0 ? pageRules : []);
        for (const problem of getPageProblems(report)) pageProblems.push(`@${width}px ${problem}`);
      }
      problemCount += pageProblems.length;
      console.log(`${pageProblems.length ? '✗' : '✓'} ${pageFile}${pageProblems.map((problem) => `\n    ${problem}`).join('')}`);
    }
  } finally {
    await browser.close();
    if (server) await server.close();
  }
  console.log(`\n${problemCount ? '✗' : '✓'} ${problemCount} problem(s)`);
  return problemCount ? 1 : 0;
}
