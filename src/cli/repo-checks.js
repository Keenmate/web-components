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
  return getPackageDistTargets(packageJson).filter(({ target }) => !outputPaths.has(target) && !target.endsWith('.map'));
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

/** Mentions in README.md / CLAUDE.md / docs/*.md of ports outside the repo's block → [{ file, port }]. */
export function loadStalePortMentions(root, portBlock) {
  const blockRange = getPortBlockRange(portBlock);
  const docsDir = join(root, DOCS_DIR);
  const docFiles = [...DOC_FILES, ...(existsSync(docsDir) ? readdirSync(docsDir).filter((name) => name.endsWith('.md')).map((name) => `${DOCS_DIR}/${name}`) : [])];
  return docFiles.flatMap((file) => {
    const text = readText(join(root, file));
    return text ? getMentionedPorts(text).filter((port) => !checkIsInRange(port, blockRange)).map((port) => ({ file, port })) : [];
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
