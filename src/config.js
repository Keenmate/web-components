/**
 * `@keenmate/web-components-devkit` — config resolution.
 *
 * Every component describes itself ONCE, in the `kmwc` section of its
 * package.json. The Vite preset, the Playwright preset and every `kmwc` CLI
 * command read it through `getKmwcConfig()`, so ports, titles, accent colours,
 * analytics ids and image names can't drift between vite.config.ts, the
 * Makefile, the Dockerfile and the example pages.
 *
 * Plain JSON (not a JS config file) on purpose: the CLI, templates and the
 * README generator read it without a TS loader, and the registry generator can
 * read sibling repos without executing their code.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

/** Absolute path of the devkit package root (this repo). */
export const DEVKIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Default rulebook location: a BlissFramework checkout next to the KM folder. */
export const DEFAULT_RULEBOOK_PATH = resolve(DEVKIT_ROOT, '..', '..', 'BlissFramework', 'guidelines', 'web-components');

/** Files the devkit now owns — finding one of these in a component is a doctor error. */
export const LEGACY_FILES = [
  'examples-chapter-nav.js',
  'examples-copy-link.js',
  'examples-controls-store.js',
  'examples-shared.css',
  'plausible-snippet.html',
  'scripts/check-variable-manifest.mjs',
];

/**
 * Port blocks: every repo owns one block of 100 (components.json `port`):
 * dev server = block, preview = +1, examples image = +10. Each registry kind
 * has its own range with headroom, numbered by 100 in registry order, so a new
 * component lands next to the other components.
 */
export const PORT_BLOCK_SIZE = 100;
export const PREVIEW_PORT_OFFSET = 1;
export const IMAGE_PORT_OFFSET = 10;
export const PORT_RANGES = [
  { kinds: ['component'], firstBlock: 12100, lastBlock: 14900 },
  { kinds: ['library'], firstBlock: 15000, lastBlock: 15900 },
  { kinds: ['showcase', 'docs'], firstBlock: 16000, lastBlock: 16900 },
  { kinds: ['test'], firstBlock: 17000, lastBlock: 17900 },
];

export function getPortsForBlock(portBlock) {
  return { dev: portBlock, preview: portBlock + PREVIEW_PORT_OFFSET, image: portBlock + IMAGE_PORT_OFFSET };
}

export function getPortRange(kind) {
  const portRange = PORT_RANGES.find((range) => range.kinds.includes(kind));
  if (!portRange) throw new Error(`kmwc: no port range for registry kind "${kind}"`);
  return portRange;
}

/** The next free block in the kind's range (after the highest block used by that range). */
export function getNextPortBlock(registry = getRegistry(), kind = 'component') {
  const portRange = getPortRange(kind);
  const usedBlocks = registry.components
    .filter((entry) => portRange.kinds.includes(entry.kind) && typeof entry.port === 'number')
    .map((entry) => entry.port);
  const nextBlock = usedBlocks.length ? Math.max(...usedBlocks) + PORT_BLOCK_SIZE : portRange.firstBlock;
  if (nextBlock > portRange.lastBlock) throw new Error(`kmwc: the ${portRange.kinds.join('/')} port range ${portRange.firstBlock}–${portRange.lastBlock} is full`);
  return nextBlock;
}

/**
 * Files that must never reach a consumer's node_modules (`kmwc doctor` checks
 * the `npm pack` file list). AI-assistant guidance (CLAUDE.md / .claude/)
 * slips in whenever a `files` entry is a directory glob like `src/css`, so the
 * scaffold's allowlist excludes it with PACKAGE_FILES_EXCLUSIONS.
 */
export const PACKAGE_LEAK_RULES = [
  { pattern: /(^|\/)CLAUDE\.md$/i, label: 'CLAUDE.md (AI-assistant guidance)' },
  { pattern: /(^|\/)\.claude\//, label: '.claude/ (AI-assistant commands)' },
  { pattern: /^(test|tests|e2e)\//, label: 'test / e2e sources' },
  { pattern: /\.(spec|test)\.[cm]?[jt]sx?$/, label: '*.spec / *.test files' },
  { pattern: /^(examples-[^/]*\.html|index\.html|partials\/)/, label: 'example pages' },
  { pattern: /^(dist-examples|test-results|playwright-report)\//, label: 'build / test output' },
  { pattern: /(^|\/)(\.makefile\.env|Makefile\.local)$/, label: 'local make config' },
];

/** Negated `files` entries the scaffold adds (npm applies them after the globs). */
export const PACKAGE_FILES_EXCLUSIONS = ['!**/CLAUDE.md', '!**/.claude'];

/** Root-level HTML files that are fragments, not pages (never built as entries). */
export const NON_PAGE_HTML_FILES = ['plausible-snippet.html'];

/**
 * Peer dependencies (vite, @playwright/test) must come from the COMPONENT's
 * node_modules, not the devkit's: when the devkit is a `file:`/`npm link`
 * symlink, Node resolves bare imports from the devkit's real path, which would
 * load a second copy (or none). Playwright in particular breaks if the config
 * and the specs see different instances.
 */
export function getPeerModule(root, moduleId) {
  return createRequire(join(resolve(root), 'package.json'))(moduleId);
}

export async function loadPeerModule(root, moduleId) {
  const requireFromRoot = createRequire(join(resolve(root), 'package.json'));
  return import(pathToFileURL(requireFromRoot.resolve(moduleId)).href);
}

export function getJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function getDevkitPackageJson() {
  return getJsonFile(join(DEVKIT_ROOT, 'package.json'));
}

export function getRegistry() {
  return getJsonFile(join(DEVKIT_ROOT, 'components.json'));
}

/** Strip the npm scope: `@keenmate/web-multiselect` → `web-multiselect`. */
export function getUnscopedName(packageName) {
  return String(packageName || '').replace(/^@[^/]+\//, '');
}

/** `web-multiselect` → `Web Multiselect` (fallback title only — set `kmwc.title`). */
export function mapToTitleCase(id) {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** `web-multiselect` → `WebMultiselect`. */
export function mapToPascalCase(id) {
  return mapToTitleCase(id).replace(/\s+/g, '');
}

function getRepositoryUrl(packageJson) {
  const rawUrl = typeof packageJson.repository === 'string' ? packageJson.repository : packageJson.repository?.url;
  if (!rawUrl) return '';
  return rawUrl.replace(/^git\+/, '').replace(/\.git$/, '');
}

/**
 * Read and resolve `package.json#kmwc` for the component rooted at `root`.
 * Every field has a default, so a component only states what's specific to it.
 *
 * @param {string} [root] component root (defaults to `process.cwd()`)
 * @returns {import('./config.js').KmwcConfig}
 */
export function getKmwcConfig(root = process.cwd()) {
  root = resolve(root);
  const packageJsonPath = join(root, 'package.json');
  if (!existsSync(packageJsonPath)) throw new Error(`kmwc: no package.json in ${root}`);
  return mapKmwcConfig(getJsonFile(packageJsonPath), root);
}

/** Map a parsed package.json to the resolved config (pure — used by tests). */
export function mapKmwcConfig(packageJson, root = process.cwd()) {
  const packageConfig = packageJson.kmwc || {};
  const id = packageConfig.id || getUnscopedName(packageJson.name) || 'component';
  const library = packageConfig.library || {};
  const examples = packageConfig.examples || {};
  const ports = packageConfig.ports || {};
  const image = packageConfig.image || {};
  const theme = packageConfig.theme || {};
  const analytics = packageConfig.analytics || {};
  const cssVariables = packageConfig.cssVariables || {};
  const rulebook = packageConfig.rulebook || {};
  const devPort = ports.dev ?? 5173;

  return {
    root,
    hasPackageConfig: !!packageJson.kmwc,
    packageJson,
    id,
    packageName: packageJson.name || id,
    version: packageJson.version || '0.1.0',
    title: packageConfig.title || mapToTitleCase(id),
    tagline: packageConfig.tagline || packageJson.description || '',
    tag: packageConfig.tag || id,
    prefix: packageConfig.prefix || '',
    repository: getRepositoryUrl(packageJson),
    homepage: packageJson.homepage || '',
    author: typeof packageJson.author === 'string' ? packageJson.author : packageJson.author?.name || 'KeenMate',
    license: packageJson.license || 'MIT',
    library: {
      entry: library.entry || 'src/index.ts',
      globalName: library.globalName || mapToPascalCase(id),
      fileName: library.fileName || id,
      formats: library.formats || ['es', 'umd'],
      // Vite 6+ names lib CSS after the package; keep the historical `style.css`
      // so consumers importing `dist/style.css` don't break on the Vite 7 move.
      cssFileName: library.cssFileName || 'style',
      shouldEmitTypes: library.shouldEmitTypes ?? true,
      typesPluginConfig: library.typesPluginConfig || {},
      shouldEmitSourcemap: library.shouldEmitSourcemap ?? false,
      external: library.external || [],
    },
    ports: {
      dev: devPort,
      preview: devPort + PREVIEW_PORT_OFFSET,
      image: ports.image ?? devPort + IMAGE_PORT_OFFSET,
    },
    theme: {
      accentColor: theme.accentColor || '',
      accentEndColor: theme.accentEndColor || '',
    },
    examples: {
      outDir: examples.outDir || 'dist-examples',
      canonicalOrigin: examples.canonicalOrigin || '',
      staticPaths: examples.staticPaths || [],
      excludedPages: examples.excludedPages || [],
      storagePrefix: examples.storagePrefix || id,
    },
    analytics: {
      plausibleSiteId: analytics.plausibleSiteId || '',
      plausibleHostUrl: analytics.plausibleHostUrl || 'https://stats.keenmate.services',
    },
    image: {
      name: image.name || `registry.km8.es/${id}-examples:prod`,
      container: image.container || `${id}-examples`,
      runner: image.runner || 'podman',
      nodeImage: image.nodeImage || '24-alpine',
      packageJsonPaths: image.packageJsonPaths || ['package.json'],
      installCommand: image.installCommand || 'npm install --no-audit --no-fund',
    },
    cssVariables: {
      manifest: cssVariables.manifest || 'component-variables.manifest.json',
      sources: cssVariables.sources || ['src/css'],
      internalVariables: cssVariables.internalVariables || [],
      checkMode: cssVariables.checkMode || 'declared',
    },
    rulebook: {
      path: process.env.KMWC_RULEBOOK_PATH || rulebook.path || DEFAULT_RULEBOOK_PATH,
      skippedChecks: rulebook.skippedChecks || [],
    },
    sync: {
      skippedFiles: packageConfig.sync?.skippedFiles || [],
    },
  };
}

/** Build-time constants every component's source may reference (`__VERSION__` …). */
export function generateBuildDefines(config) {
  return {
    __VERSION__: JSON.stringify(config.version),
    __PACKAGE_NAME__: JSON.stringify(config.packageName),
    __AUTHOR__: JSON.stringify(config.author),
    __LICENSE__: JSON.stringify(config.license),
    __REPOSITORY__: JSON.stringify(config.repository),
    __HOMEPAGE__: JSON.stringify(config.homepage),
  };
}
