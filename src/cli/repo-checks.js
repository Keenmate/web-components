/**
 * Repo checks behind `kmwc doctor` that read a component's own files (and its
 * registry siblings): accepted rulebook deviations, library output names, ports,
 * analytics ids and page CSS the kit already covers. Each check is a pure
 * function over text / config where it can be (unit-tested), plus a thin
 * file-reading wrapper.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEVKIT_ROOT } from '../config.js';

export const VALIDATION_NOTES_FILE = 'VALIDATION-NOTES.md';
const PORT_BLOCK_SIZE = 100;
const PLAUSIBLE_SNIPPET_FILE = 'plausible-snippet.html';
const DOC_FILES = ['README.md', 'CLAUDE.md'];
const DOCS_DIR = 'docs';
const SIBLING_PORT_FILES = ['vite.config.ts', 'vite.config.mjs', 'vite.config.js', 'playwright.config.ts', 'playwright.config.mjs', 'playwright.config.js', 'Makefile', 'make.bat'];
const PORTED_SCRIPTS = { dev: 'dev', preview: 'preview', 'preview:examples': 'preview' };
const CHECK_ID_PATTERN = /\bC-[A-Z]+-\d+\b/g;

const readText = (filePath) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : null);
const getUniqueSorted = (values) => [...new Set(values)].sort((left, right) => (left > right ? 1 : left < right ? -1 : 0));

// ── accepted deviations ──────────────────────────────────────────────────────

/**
 * Check ids accepted in VALIDATION-NOTES.md: every `C-XX-N` in a `##` heading
 * (`## C-CST-4 / C-CST-10 — …` accepts both). Only headings count, so prose that
 * merely mentions a check doesn't accept it.
 */
export function getAcceptedCheckIds(notesText) {
  if (!notesText) return new Set();
  const headings = notesText.split(/\r?\n/).filter((line) => /^##\s/.test(line));
  return new Set(headings.flatMap((heading) => heading.match(CHECK_ID_PATTERN) || []));
}

export function loadAcceptedCheckIds(root) {
  return getAcceptedCheckIds(readText(join(root, VALIDATION_NOTES_FILE)));
}

// ── library output names ─────────────────────────────────────────────────────

/** The dist/ files the library build emits for a resolved `config.library`. */
export function getLibraryOutputPaths(library) {
  const outputPaths = library.formats.map((format) => `dist/${library.fileName}.${format === 'es' ? 'js' : `${format}.js`}`);
  outputPaths.push(`dist/${library.cssFileName}.css`);
  if (library.shouldEmitTypes) outputPaths.push('dist/index.d.ts');
  return outputPaths;
}

/** Every `./dist/…` target package.json points at, as [{ field, target }] (globs skipped). */
export function getPackageDistTargets(packageJson) {
  const targets = [];
  const addTarget = (field, target) => {
    if (typeof target !== 'string') return;
    const normalizedTarget = target.replace(/^\.\//, '');
    if (normalizedTarget.startsWith('dist/') && !normalizedTarget.includes('*') && !normalizedTarget.endsWith('/')) targets.push({ field, target: normalizedTarget });
  };
  for (const field of ['main', 'module', 'types', 'typings', 'style', 'browser', 'unpkg', 'jsdelivr']) addTarget(field, packageJson[field]);
  const visitExports = (value, path) => {
    if (typeof value === 'string') addTarget(path, value);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) visitExports(child, `${path}[${JSON.stringify(key)}]`);
  };
  visitExports(packageJson.exports, 'exports');
  return targets;
}

/**
 * package.json targets the library build won't produce — a renamed UMD/ES file
 * or CSS breaks consumers silently (Vite 7 names the CSS after the package
 * unless kmwc.library.cssFileName says otherwise). Pure.
 */
export function getLibraryOutputMismatches(packageJson, library) {
  const outputPaths = new Set(getLibraryOutputPaths(library));
  // Types emitted by the repo's own step (`tsc`) aren't the preset's to know.
  const isOwnTypes = (target) => !library.shouldEmitTypes && target.endsWith('.d.ts');
  return getPackageDistTargets(packageJson).filter(({ target }) => !outputPaths.has(target) && !target.endsWith('.map') && !isOwnTypes(target));
}

/**
 * A hand-written vite.config's `lib.name` (the UMD global) — migration check: the
 * preset derives the global from kmwc.library.globalName. null when not found.
 */
export function getLegacyGlobalName(viteConfigText) {
  const libraryBlock = viteConfigText.match(/\blib\s*:\s*\{([\s\S]*?)\}/);
  return libraryBlock?.[1].match(/\bname\s*:\s*['"]([A-Za-z_$][\w$]*)['"]/)?.[1] || null;
}

// ── ports ────────────────────────────────────────────────────────────────────

/** [first, last] port of a registry block (blocks are numbered by 100). */
export function getPortBlockRange(portBlock) {
  return [portBlock, portBlock + PORT_BLOCK_SIZE - 1];
}

const checkIsInRange = (port, [firstPort, lastPort]) => port >= firstPort && port <= lastPort;

/** Scripts that pin a `--port` different from kmwc.ports → [{ scriptName, port, expectedPort }]. Pure. */
export function getScriptPortMismatches(scripts = {}, ports) {
  return Object.entries(PORTED_SCRIPTS).flatMap(([scriptName, portName]) => {
    const port = Number(String(scripts[scriptName] || '').match(/--port[=\s]+(\d+)/)?.[1]);
    return port && port !== ports[portName] ? [{ scriptName, port, expectedPort: ports[portName] }] : [];
  });
}

/** Ports a text names as `localhost:N`, `--port N`, `port: N`, `port N` or `PORT ?= N`. Pure. */
export function getMentionedPorts(text) {
  const patterns = [/localhost:(\d{4,5})\b/g, /--port[=\s]+(\d{4,5})\b/g, /\bport\s*[:=]\s*(\d{4,5})\b/gi, /\bport\s+(\d{4,5})\b/gi, /PORT\s*\??=\s*(\d{4,5})\b/g];
  return getUniqueSorted(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => Number(match[1]))));
}

/**
 * A doc that names other repos' ports on purpose (a dated plan, a cross-repo review) carries
 * `<!-- kmwc-other-ports: why -->` and isn't scanned.
 */
export const OTHER_PORTS_MARKER = 'kmwc-other-ports';

/** Mentions in README.md / CLAUDE.md / docs/*.md of ports outside the repo's block → [{ file, port }]. */
export function loadStalePortMentions(root, portBlock) {
  const blockRange = getPortBlockRange(portBlock);
  const docsDir = join(root, DOCS_DIR);
  const docFiles = [...DOC_FILES, ...(existsSync(docsDir) ? readdirSync(docsDir).filter((name) => name.endsWith('.md')).map((name) => `${DOCS_DIR}/${name}`) : [])];
  return docFiles.flatMap((file) => {
    const text = readText(join(root, file));
    return text && !text.includes(OTHER_PORTS_MARKER) ? getMentionedPorts(text).filter((port) => !checkIsInRange(port, blockRange)).map((port) => ({ file, port })) : [];
  });
}

/** Ports a repo listens on: kmwc.ports (+ preview), script --port flags, ports in its vite / playwright configs and Makefile. */
export function loadRepoPorts(repoRoot) {
  const repoPorts = [];
  const packageJson = JSON.parse(readText(join(repoRoot, 'package.json')) || '{}');
  const kmwcPorts = packageJson.kmwc?.ports || {};
  if (kmwcPorts.dev) repoPorts.push({ port: kmwcPorts.dev, file: 'package.json#kmwc.ports.dev' }, { port: kmwcPorts.dev + 1, file: 'package.json#kmwc.ports (preview)' });
  if (kmwcPorts.image) repoPorts.push({ port: kmwcPorts.image, file: 'package.json#kmwc.ports.image' });
  for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    for (const port of getMentionedPorts(command)) repoPorts.push({ port, file: `package.json#scripts.${scriptName}` });
  }
  for (const file of SIBLING_PORT_FILES) {
    const text = readText(join(repoRoot, file));
    if (text) for (const port of getMentionedPorts(text)) repoPorts.push({ port, file });
  }
  return repoPorts;
}

/**
 * A sibling's checkout, resolved next to this repo. Registry paths are relative
 * to the devkit checkout, which sits beside the components — so `../<id>` works
 * from any component root. Entries inside the devkit (`.`, `playground`) and the
 * repo itself are not siblings.
 */
function getSiblingRoot(root, registryEntry) {
  if (!registryEntry.path?.startsWith('../')) return null;
  const siblingRoot = resolve(root, registryEntry.path);
  return siblingRoot === resolve(root) ? null : siblingRoot;
}

/** Sibling repos listening on a port inside this repo's block → [{ id, port, file }]. */
export function loadSiblingPortCollisions(config, registry) {
  const ownEntry = registry.components.find((entry) => entry.id === config.id);
  if (!ownEntry?.port) return [];
  const blockRange = getPortBlockRange(ownEntry.port);
  return registry.components
    .filter((entry) => entry.id !== config.id)
    .flatMap((entry) => {
      const siblingRoot = getSiblingRoot(config.root, entry);
      if (!siblingRoot || !existsSync(join(siblingRoot, 'package.json'))) return [];
      return loadRepoPorts(siblingRoot)
        .filter(({ port }) => checkIsInRange(port, blockRange))
        .map(({ port, file }) => ({ id: entry.id, port, file }));
    });
}

/** This repo's own configs naming a port outside its block (a hand-written vite.config before migration). */
export function loadOwnPortsOutsideBlock(config, portBlock) {
  const blockRange = getPortBlockRange(portBlock);
  return loadRepoPorts(config.root).filter(({ port, file }) => !checkIsInRange(port, blockRange) && !file.startsWith('package.json#kmwc'));
}

// ── analytics ────────────────────────────────────────────────────────────────

/** A repo's Plausible site id: kmwc.analytics.plausibleSiteId, else the legacy snippet's `pa-…` script. */
export function loadPlausibleSiteId(repoRoot) {
  const packageJson = JSON.parse(readText(join(repoRoot, 'package.json')) || '{}');
  if (packageJson.kmwc?.analytics?.plausibleSiteId) return packageJson.kmwc.analytics.plausibleSiteId;
  return readText(join(repoRoot, PLAUSIBLE_SNIPPET_FILE))?.match(/\/js\/(pa-[\w-]+)\.js/)?.[1] || null;
}

/** Siblings using the same Plausible site id (their traffic would be counted as this site's) → [id]. */
export function loadSharedPlausibleSiteIds(config, registry, siteId) {
  if (!siteId) return [];
  return registry.components
    .filter((entry) => entry.id !== config.id)
    .filter((entry) => {
      const siblingRoot = getSiblingRoot(config.root, entry);
      return siblingRoot && existsSync(join(siblingRoot, 'package.json')) && loadPlausibleSiteId(siblingRoot) === siteId;
    })
    .map((entry) => entry.id);
}

// ── page CSS the kit already covers ──────────────────────────────────────────

/** Page-local selectors with a kit replacement (key → advice). */
export const KIT_REPLACED_SELECTORS = {
  '.kbd': 'use <kbd> — the kit styles it',
  kbd: 'the kit styles <kbd>',
  mark: 'the kit styles <mark>',
  '.mt-1': 'the kit has .mt-1',
  '.push-end': 'the kit has .push-end',
  '.mono': 'the kit has .mono',
};

/** The kit's page vocabulary — every unprefixed class its stylesheets define. */
export function loadKitClassNames() {
  const cssDir = join(DEVKIT_ROOT, 'src', 'examples', 'css');
  const cssText = readdirSync(cssDir).map((name) => readFileSync(join(cssDir, name), 'utf8')).join('\n');
  return new Set([...cssText.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1]).filter((name) => !name.startsWith('kmwc')));
}

/** Top-level selectors of a stylesheet (one per comma part, comments and at-rule wrappers ignored). Pure. */
export function getRuleSelectors(cssText) {
  const plainText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plainText.matchAll(/(^|[{};])\s*([^{};@]+?)\s*\{/g)].flatMap((match) => match[2].split(',').map((part) => part.trim())).filter(Boolean);
}

/** Map an inline width to the nearest kit width helper (4 / 6 / 9 / 12rem). */
function getWidthClass(value, unit) {
  const rem = unit === 'px' ? value / 16 : value;
  return rem <= 5 ? 'w-xs' : rem <= 7.5 ? 'w-sm' : rem <= 10.5 ? 'w-md' : 'w-lg';
}

/**
 * What in one page (or examples-local.css) re-implements the kit: rules on a
 * kit-owned selector and single-declaration inline styles a kit class covers.
 * Returns [{ found, advice }]. Pure — `kitClassNames` from loadKitClassNames().
 */
export function getKitDuplicates(pageText, kitClassNames, { isStylesheet = false } = {}) {
  const duplicates = [];
  const styleText = isStylesheet ? pageText : [...pageText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  for (const selector of getUniqueSorted(getRuleSelectors(styleText))) {
    if (KIT_REPLACED_SELECTORS[selector]) duplicates.push({ found: `${selector} { … }`, advice: KIT_REPLACED_SELECTORS[selector] });
    else if (/^\.[a-z][a-z0-9-]*$/.test(selector) && kitClassNames.has(selector.slice(1))) {
      duplicates.push({ found: `${selector} { … }`, advice: `restyles the kit's ${selector} for this page — scope it (e.g. .my-demo ${selector}) or drop it` });
    }
  }
  if (isStylesheet) return duplicates;
  for (const match of pageText.matchAll(/<(\w+)\b[^>]*\sstyle="\s*([^";]+?)\s*;?\s*"/g)) {
    const [, tagName, declaration] = match;
    const width = declaration.match(/^width\s*:\s*(\d+(?:\.\d+)?)(rem|px)$/i);
    if (width && /^(input|select)$/i.test(tagName)) duplicates.push({ found: `<${tagName} style="${declaration}">`, advice: `class="${getWidthClass(Number(width[1]), width[2])}"` });
    else if (/^margin-(left|inline-start)\s*:\s*auto$/i.test(declaration)) duplicates.push({ found: `style="${declaration}"`, advice: 'class="push-end"' });
    else if (/^margin-top\s*:\s*1rem$/i.test(declaration)) duplicates.push({ found: `style="${declaration}"`, advice: 'class="mt-1"' });
  }
  return duplicates;
}

// ── hard-coded colours in page CSS ───────────────────────────────────────────

/**
 * Fixed colours on purpose (a theme gallery, a mockup, a test fixture): a page `<style>`
 * block or an element with a `style="…"` that carries the attribute, or one rule right
 * after a `/* kmwc-fixed-colors *\/` comment.
 */
export const FIXED_COLORS_ATTRIBUTE = 'data-kmwc-fixed-colors';
export const FIXED_COLORS_MARKER = 'kmwc-fixed-colors';
const MARKED_RULE_PATTERN = new RegExp(`/\\*[^*]*${FIXED_COLORS_MARKER}[\\s\\S]*?\\*/\\s*[^{}]*\\{[^{}]*\\}`, 'g');
const COLOR_PROPERTY_PATTERN = /color|background|border|outline|shadow|fill|stroke|text-decoration/i;
const COLOR_LITERAL_PATTERN =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*(?!from\b)|\b(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|teal|maroon|olive|lime|aqua|fuchsia|gold|crimson)\b/i;

/** A declaration value with every `var(…)` collapsed — a literal fallback never shows while the kit token exists. */
function mapWithoutVarFallbacks(value) {
  let previous;
  let current = value;
  do {
    previous = current;
    current = current.replace(/var\([^()]*\)/gi, 'var()');
  } while (current !== previous);
  return current;
}

/** True when a colour declaration's value is a literal that ignores dark mode. Pure. */
export function checkIsHardcodedColor(property, value) {
  if (!COLOR_PROPERTY_PATTERN.test(property) || property.startsWith('--')) return false;
  const plainValue = mapWithoutVarFallbacks(value);
  return !/light-dark\(/i.test(plainValue) && COLOR_LITERAL_PATTERN.test(plainValue);
}

/**
 * Hard-coded colours in one page's `<style>` blocks and `style="…"` attributes (or in
 * examples-local.css): they stay the same in dark mode while the kit around them flips.
 * `var()` fallbacks and `light-dark()` pairs follow the theme; a `<style data-kmwc-fixed-colors>`
 * block, an element carrying the attribute and a rule marked `/* kmwc-fixed-colors *\/` are skipped. Returns [{ found }]. Pure.
 */
export function getHardcodedColors(pageText, { isStylesheet = false } = {}) {
  const styleText = isStylesheet
    ? pageText
    : [...pageText.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)]
        .filter((match) => !match[1].includes(FIXED_COLORS_ATTRIBUTE))
        .map((match) => match[2])
        .join('\n');
  const hardcodedColors = [];
  const checkedText = styleText.replace(MARKED_RULE_PATTERN, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selector, body] of checkedText.matchAll(/([^{};@]+?)\s*\{([^{}]*)\}/g)) {
    for (const declaration of body.split(';')) {
      const [property, ...valueParts] = declaration.split(':');
      const value = valueParts.join(':').trim();
      if (value && checkIsHardcodedColor(property.trim(), value)) hardcodedColors.push({ found: `${selector.trim().replace(/\s+/g, ' ')} { ${property.trim()}: ${value} }` });
    }
  }
  if (isStylesheet) return hardcodedColors;
  for (const match of pageText.matchAll(/\sstyle="([^"]*)"/g)) {
    // The element's own attribute opts its style="…" out: markup a render callback draws
    // inside a shadow root can't be reached by page CSS, so inline is the only way there.
    const tagText = pageText.slice(pageText.lastIndexOf('<', match.index), pageText.indexOf('>', match.index + match[0].length) + 1);
    if (tagText.includes(FIXED_COLORS_ATTRIBUTE)) continue;
    const inlineStyle = match[1];
    for (const declaration of inlineStyle.split(';')) {
      const [property, ...valueParts] = declaration.split(':');
      const value = valueParts.join(':').trim();
      if (value && checkIsHardcodedColor(property.trim(), value)) hardcodedColors.push({ found: `style="${property.trim()}: ${value}"` });
    }
  }
  return hardcodedColors;
}

// ── core's default loader class ──────────────────────────────────────────────

const CORE_PACKAGE_PATH = join('node_modules', '@keenmate', 'web-components-core');
const CORE_RENDER_LOADER_FILE = join('dist', 'dom', 'render-loader.js');
const SOURCE_DIR = 'src';
const SKIPPED_SOURCE_DIRS = new Set(['node_modules', 'dist']);

/**
 * The separator in the class core's default loader gets: `'__'` (`<prefix>__loader`),
 * `'-'` (`<prefix>-loader`, before core 6d6b768), or null when the build doesn't say. Pure.
 */
export function getCoreLoaderSeparator(renderLoaderText) {
  const match =
    renderLoaderText.match(/\$\{\s*[\w$.]+\s*\}(__|-)loader(?![\w-])/) || renderLoaderText.match(/\+\s*["'`](__|-)loader["'`]/);
  return match ? match[1] : null;
}

/** The loader classes a stylesheet styles: [{ className, separator }]. Pure. */
export function getStyledLoaderClasses(cssText, prefix) {
  const pattern = new RegExp(`\.(${prefix}(__|-)loader)(?![\w-])`, 'g');
  const plainText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = new Map([...plainText.matchAll(pattern)].map((match) => [match[1], match[2]]));
  return [...classes].map(([className, separator]) => ({ className, separator }));
}

/** The installed core (walking up for hoisted installs): { version, separator } or null. */
export function loadCoreLoader(root) {
  for (let directory = resolve(root); ; directory = resolve(directory, '..')) {
    const packageText = readText(join(directory, CORE_PACKAGE_PATH, 'package.json'));
    if (packageText) {
      const renderLoaderText = readText(join(directory, CORE_PACKAGE_PATH, CORE_RENDER_LOADER_FILE));
      return { version: JSON.parse(packageText).version, separator: renderLoaderText ? getCoreLoaderSeparator(renderLoaderText) : null };
    }
    if (resolve(directory, '..') === directory) return null;
  }
}

function getSourceStylesheets(directory, relativeDirectory = SOURCE_DIR) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) return SKIPPED_SOURCE_DIRS.has(entry.name) ? [] : getSourceStylesheets(join(directory, entry.name), relativePath);
    return entry.name.endsWith('.css') ? [relativePath] : [];
  });
}

/**
 * Styled loader classes vs the separator core draws → { isCoreClassStyled, renamedClasses,
 * collidingClasses }. A class with the other separator is a rename done too early / too late —
 * unless core is still on `-` and its class is styled too: then the `__loader` is the
 * component's own element (web-multiselect's loading-state row), which collides once core
 * draws `<prefix>__loader`. Pure.
 */
export function getLoaderClassVerdict(coreSeparator, styledLoaderClasses) {
  const isCoreClassStyled = styledLoaderClasses.some(({ separator }) => separator === coreSeparator);
  const otherClasses = styledLoaderClasses.filter(({ separator }) => separator !== coreSeparator);
  const isOwnLoaderElement = coreSeparator === '-' && isCoreClassStyled;
  return {
    isCoreClassStyled,
    renamedClasses: isOwnLoaderElement ? [] : otherClasses,
    collidingClasses: isOwnLoaderElement ? otherClasses : [],
  };
}

/** Loader classes styled in the component's src CSS: [{ file, className, separator }]. */
export function loadStyledLoaderClasses(root, prefix) {
  return getSourceStylesheets(join(root, SOURCE_DIR)).flatMap((file) =>
    getStyledLoaderClasses(readFileSync(join(root, file), 'utf8'), prefix).map((styledClass) => ({ file, ...styledClass }))
  );
}
