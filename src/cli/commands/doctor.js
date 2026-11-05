/**
 * kmwc doctor — check a component repo against the Keenmate standard.
 *
 * Two halves:
 *   1. Devkit checks — drift prevention: every check is something a past
 *      session did locally that the devkit now owns (a forked helper script, a
 *      hand-edited Dockerfile, a port picked at random…).
 *   2. Rulebook checks — runs the BlissFramework `guidelines/web-components/
 *      *.checks.sh` suites (path: kmwc.rulebook.path / KMWC_RULEBOOK_PATH) and
 *      reports their FAILs. The rulebook stays the single source of truth; when
 *      it isn't checked out (or bash is missing) the suites are skipped with a
 *      warning. `--no-rulebook` skips them on purpose.
 *
 * Errors fail (exit 1); warnings don't.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getKmwcConfig, getPortsForBlock, getRegistry, LEGACY_FILES, NON_PAGE_HTML_FILES, PACKAGE_LEAK_RULES, PACKAGE_FILES_EXCLUSIONS } from '../../config.js';
import { getSyncPlan, getScriptsPlan, CLAUDE_BLOCK_START } from '../sync-plan.js';
import { checkIsFragment } from '../../vite/page-composer.js';
import { loadManifestVerdict } from './check-vars.js';
import {
  VALIDATION_NOTES_FILE,
  loadAcceptedCheckIds,
  getLibraryOutputMismatches,
  getLibraryOutputPaths,
  getLegacyGlobalName,
  getPortBlockRange,
  getScriptPortMismatches,
  loadStalePortMentions,
  OTHER_PORTS_MARKER,
  loadSiblingPortCollisions,
  loadOwnPortsOutsideBlock,
  loadPlausibleSiteId,
  loadSharedPlausibleSiteIds,
  loadKitClassNames,
  getKitDuplicates,
  FIXED_COLORS_ATTRIBUTE,
  FIXED_COLORS_MARKER,
  getHardcodedColors,
  loadCoreLoader,
  getLoaderClassVerdict,
  loadStyledLoaderClasses,
} from '../repo-checks.js';

const DEVKIT_PACKAGE_NAME = '@keenmate/web-components-devkit';
const LOCAL_STYLESHEET_FILE = 'examples-local.css';
const LEGACY_PAGE_REFERENCES = ['examples-shared.css', 'examples-chapter-nav.js', 'examples-copy-link.js', 'examples-controls-store.js'];
const VITE_CONFIG_FILES = ['vite.config.ts', 'vite.config.mjs', 'vite.config.js'];
const PLAYWRIGHT_CONFIG_FILES = ['playwright.config.ts', 'playwright.config.mjs', 'playwright.config.js'];

/**
 * Rulebook suites in the rulebook's canonical reading order; the prefix is
 * passed where the script takes one. `isComponentOnly` suites check what a
 * custom element ships (its CSS, manifest, overlay) — a `library` (registry
 * kind, or kmwc.kind) skips them.
 */
export const RULEBOOK_SUITES = [
  { name: 'component-structure', isPrefixed: false, isComponentOnly: true },
  { name: 'naming-conventions', isPrefixed: true, isComponentOnly: false },
  { name: 'css-structure', isPrefixed: true, isComponentOnly: true },
  { name: 'theme-container', isPrefixed: true, isComponentOnly: true },
  { name: 'base-variables', isPrefixed: true, isComponentOnly: true },
  { name: 'color-scheme', isPrefixed: true, isComponentOnly: true },
  { name: 'readme-structure', isPrefixed: false, isComponentOnly: false },
  { name: 'custom-elements-manifest', isPrefixed: false, isComponentOnly: true },
  { name: 'responsive-overlay', isPrefixed: true, isComponentOnly: true },
  { name: 'publish-command', isPrefixed: false, isComponentOnly: false },
  { name: 'example-pages', isPrefixed: false, isComponentOnly: false },
];

const LIBRARY_KIND = 'library';

/** The suites that apply to a repo of `kind`. Pure — exported for tests. */
export function getRulebookSuites(kind) {
  return RULEBOOK_SUITES.filter((suite) => kind !== LIBRARY_KIND || !suite.isComponentOnly);
}

function getMajorVersion(versionRange) {
  const match = String(versionRange || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getFirstExistingFile(root, fileNames) {
  return fileNames.find((fileName) => existsSync(join(root, fileName))) || null;
}

/** Strip ANSI colour codes (the suites colour output when they think they're on a TTY). */
const mapToPlainText = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Parse a suite's output into failures: lines shaped `❌ FAIL <id> — <reason>`.
 * Exported for tests.
 */
export function getSuiteFailures(suiteOutput) {
  return mapToPlainText(suiteOutput)
    .split(/\r?\n/)
    .map((line) => line.match(/FAIL\s+(\S+)\s+[—-]+\s+(.*)$/))
    .filter(Boolean)
    .map((match) => ({ checkId: match[1], reason: match[2].trim() }));
}

const GIT_BASH_RELATIVE_PATH = join('bin', 'bash.exe');
// PATH entries Git for Windows adds — each sits one or two levels under the install root.
const GIT_PATH_ENTRY_PATTERN = /^(.*[\\/]Git)[\\/](?:cmd|bin|usr[\\/]bin|mingw64[\\/]bin)[\\/]?$/i;

/**
 * The bash that runs the rulebook scripts. On Windows a bare `bash` can resolve to WSL's
 * (`System32\bash.exe`, `WindowsApps\bash.exe`), which can't read `C:/…` paths: every suite
 * exits 127 and the rulebook never runs. So: KMWC_BASH when set, else Git for Windows'
 * bash (found from PATH or the usual install roots), else `bash`. Exported for tests.
 */
export function getBashPath({ platform = process.platform, env = process.env, checkExists = existsSync } = {}) {
  if (env.KMWC_BASH) return env.KMWC_BASH;
  if (platform !== 'win32') return 'bash';
  const pathEntries = (env.PATH || env.Path || '').split(';').filter(Boolean);
  const gitRoots = [
    ...pathEntries.map((entry) => entry.match(GIT_PATH_ENTRY_PATTERN)?.[1]).filter(Boolean),
    ...[env.ProgramFiles, env.ProgramW6432, env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs')].filter(Boolean).map((directory) => join(directory, 'Git')),
  ];
  return gitRoots.map((gitRoot) => join(gitRoot, GIT_BASH_RELATIVE_PATH)).find((bashPath) => checkExists(bashPath)) || 'bash';
}

function runRulebookSuite(config, suite) {
  const scriptPath = join(config.rulebook.path, `${suite.name}.checks.sh`).replace(/\\/g, '/');
  const scriptArgs = [scriptPath, config.root.replace(/\\/g, '/')];
  if (suite.isPrefixed && config.prefix) scriptArgs.push(config.prefix);
  return spawnSync(getBashPath(), scriptArgs, { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

/** Run every check; returns [{ level: 'pass'|'warning'|'error', checkName, message, fixHint? }]. */
export function checkComponent(config, doctorConfig = {}) {
  const results = [];
  const addPass = (checkName, message) => results.push({ level: 'pass', checkName, message });
  const addWarning = (checkName, message, fixHint) => results.push({ level: 'warning', checkName, message, fixHint });
  const addError = (checkName, message, fixHint) => results.push({ level: 'error', checkName, message, fixHint });
  const dependencies = { ...config.packageJson.dependencies, ...config.packageJson.devDependencies };

  // ── kmwc section ─────────────────────────────────────────────────────────
  if (!config.hasPackageConfig) {
    addError('config', 'package.json has no "kmwc" section', 'add { "kmwc": { "title", "prefix", "ports", … } } — see the devkit README');
  } else {
    addPass('config', 'package.json#kmwc present');
    if (!config.packageJson.kmwc.title) addWarning('config', 'kmwc.title not set (falls back to a title-cased id)', 'set kmwc.title');
    if (!config.prefix && config.kind !== LIBRARY_KIND) addWarning('config', 'kmwc.prefix not set — rulebook suites run without a CSS prefix', 'set kmwc.prefix to the prefix reserved in base-variables.md');
    if (!config.packageJson.kmwc.ports?.dev) addWarning('config', 'kmwc.ports.dev not set (falls back to 5173)', 'take the port from the devkit components.json');
  }

  // ── dependencies ─────────────────────────────────────────────────────────
  if (!dependencies[DEVKIT_PACKAGE_NAME]) addError('deps', `${DEVKIT_PACKAGE_NAME} is not a devDependency`, `npm i -D ${DEVKIT_PACKAGE_NAME}`);
  else addPass('deps', `${DEVKIT_PACKAGE_NAME} ${dependencies[DEVKIT_PACKAGE_NAME]}`);
  const viteMajorVersion = getMajorVersion(dependencies.vite);
  if (viteMajorVersion == null) addError('deps', 'vite is not a dependency', 'npm i -D vite@^7');
  else if (viteMajorVersion < 7) addError('deps', `vite ${dependencies.vite} — the standard is ^7`, 'npm i -D vite@^7');
  else addPass('deps', `vite ${dependencies.vite}`);

  // ── configs use the presets ──────────────────────────────────────────────
  const viteConfigFile = getFirstExistingFile(config.root, VITE_CONFIG_FILES);
  if (!viteConfigFile) addError('vite', 'no vite.config.*', 'create one: export default defineComponentConfig()');
  else if (!/defineComponentConfig|createExamplesPlugin/.test(readFileSync(join(config.root, viteConfigFile), 'utf8'))) {
    addError('vite', `${viteConfigFile} doesn't use the devkit preset`, "import { defineComponentConfig } from '@keenmate/web-components-devkit/vite'");
    // Before the switch: the preset derives the UMD global from kmwc — a silent rename breaks script-tag users.
    const legacyGlobalName = getLegacyGlobalName(readFileSync(join(config.root, viteConfigFile), 'utf8'));
    if (legacyGlobalName && config.library.shouldBuild && legacyGlobalName !== config.library.globalName) {
      addError('vite', `the UMD global is "${legacyGlobalName}" today; the preset would make it "${config.library.globalName}"`, `set kmwc.library.globalName to "${legacyGlobalName}"`);
    }
  } else addPass('vite', `${viteConfigFile} uses the devkit preset`);

  const playwrightConfigFile = getFirstExistingFile(config.root, PLAYWRIGHT_CONFIG_FILES);
  if (playwrightConfigFile && !/definePlaywrightConfig/.test(readFileSync(join(config.root, playwrightConfigFile), 'utf8'))) {
    addWarning(
      'playwright',
      `${playwrightConfigFile} doesn't use the devkit preset (port may drift from kmwc.ports.dev)`,
      "import { definePlaywrightConfig } from '@keenmate/web-components-devkit/playwright'"
    );
  }

  // ── legacy copies of devkit-owned files ──────────────────────────────────
  const legacyFiles = LEGACY_FILES.filter((fileName) => existsSync(join(config.root, fileName)));
  for (const legacyFile of legacyFiles) addError('legacy', `${legacyFile} is a local copy of a devkit-owned file`, 'delete it — the devkit provides it');
  if (!legacyFiles.length) addPass('legacy', 'no local copies of devkit-owned files');

  const pageFiles = readdirSync(config.root).filter((fileName) => fileName.endsWith('.html') && !NON_PAGE_HTML_FILES.includes(fileName));
  let legacyPageCount = 0;
  for (const pageFile of pageFiles) {
    const pageHtml = readFileSync(join(config.root, pageFile), 'utf8');
    const legacyReferences = LEGACY_PAGE_REFERENCES.filter((reference) => pageHtml.includes(reference));
    if (legacyReferences.length) {
      legacyPageCount++;
      addError(
        'pages',
        `${pageFile} still references ${legacyReferences.join(', ')}`,
        'remove the <link>/<script> tags (the plugin injects the kit); controls → attachControlsPersistence from the devkit'
      );
    }
  }
  if (pageFiles.length && !legacyPageCount) addPass('pages', `${pageFiles.length} page(s), none reference legacy helpers`);

  // Pages still carrying their own <head> + header chrome — the copy-paste
  // that fragment pages (shared layout) remove.
  const boilerplatePages = pageFiles.filter((pageFile) => {
    const pageHtml = readFileSync(join(config.root, pageFile), 'utf8');
    return !checkIsFragment(pageHtml) && /class="back-link"/.test(pageHtml);
  });
  if (boilerplatePages.length) {
    addWarning(
      'pages',
      `${boilerplatePages.length} page(s) repeat the head/header boilerplate: ${boilerplatePages.join(', ')}`,
      'make them fragment pages — <meta name="kmwc:title">, no <html>/<head>/<header> (see the devkit README "Fragment pages")'
    );
  }

  // Page CSS that re-implements the kit (a local .kbd after the kit styled <kbd>, inline widths …).
  const kitClassNames = loadKitClassNames();
  const localStylesheetPath = join(config.root, LOCAL_STYLESHEET_FILE);
  const kitDuplicateSources = [
    ...pageFiles.map((pageFile) => ({ file: pageFile, duplicates: getKitDuplicates(readFileSync(join(config.root, pageFile), 'utf8'), kitClassNames) })),
    ...(existsSync(localStylesheetPath)
      ? [{ file: LOCAL_STYLESHEET_FILE, duplicates: getKitDuplicates(readFileSync(localStylesheetPath, 'utf8'), kitClassNames, { isStylesheet: true }) }]
      : []),
  ].filter((source) => source.duplicates.length);
  for (const { file, duplicates } of kitDuplicateSources) {
    const shownDuplicates = duplicates.slice(0, 3).map((duplicate) => `${duplicate.found} → ${duplicate.advice}`).join('; ');
    addWarning('pages', `${file}: ${duplicates.length} rule(s) / style(s) the kit already covers — ${shownDuplicates}${duplicates.length > 3 ? ' …' : ''}`, 'use the kit (devkit README "Examples kit")');
  }
  if (pageFiles.length && !kitDuplicateSources.length) addPass('pages', 'no page CSS re-implements the kit');

  // Page CSS colours that stay put when the theme switch flips the kit to dark.
  const hardcodedColorSources = [
    ...pageFiles.map((pageFile) => ({ file: pageFile, hardcodedColors: getHardcodedColors(readFileSync(join(config.root, pageFile), 'utf8')) })),
    ...(existsSync(localStylesheetPath)
      ? [{ file: LOCAL_STYLESHEET_FILE, hardcodedColors: getHardcodedColors(readFileSync(localStylesheetPath, 'utf8'), { isStylesheet: true }) }]
      : []),
  ].filter((source) => source.hardcodedColors.length);
  for (const { file, hardcodedColors } of hardcodedColorSources) {
    const shownColors = hardcodedColors.slice(0, 3).map(({ found }) => found).join('; ');
    addWarning(
      'pages',
      `${file}: ${hardcodedColors.length} hard-coded colour(s) that don't follow dark mode — ${shownColors}${hardcodedColors.length > 3 ? ' …' : ''}`,
      `use the kit's --kmwc-* tokens or light-dark(); fixed colours on purpose: <style ${FIXED_COLORS_ATTRIBUTE}>, or /* ${FIXED_COLORS_MARKER} */ before one rule`
    );
  }
  if (pageFiles.length && !hardcodedColorSources.length) addPass('pages', 'page CSS colours follow the theme');

  // ── generated files ──────────────────────────────────────────────────────
  if (config.hasPackageConfig) {
    for (const planItem of getSyncPlan(config)) {
      if (!planItem.isChanged) {
        addPass('sync', `${planItem.path} in sync`);
        continue;
      }
      const state = planItem.currentText == null ? 'missing' : 'out of sync (edited locally or template changed)';
      if (planItem.kind === 'generated') addError('sync', `${planItem.path} ${state}`, 'npx kmwc sync (repo-specific make targets → Makefile.local)');
      else if (planItem.kind === 'claude') {
        (planItem.currentText?.includes(CLAUDE_BLOCK_START) ? addWarning : addError)('sync', `CLAUDE.md devkit block ${state}`, 'npx kmwc sync');
      } else addWarning('sync', `${planItem.path} ${state}`, 'npx kmwc sync');
    }
    const { missingScripts, differingScripts } = getScriptsPlan(config);
    if (Object.keys(missingScripts).length) addWarning('scripts', `missing standard scripts: ${Object.keys(missingScripts).join(', ')}`, 'npx kmwc sync');
    for (const [scriptName, difference] of Object.entries(differingScripts)) {
      addWarning('scripts', `"${scriptName}" is "${difference.currentCommand}", standard is "${difference.standardCommand}"`);
    }
  }

  // ── registry cross-check ─────────────────────────────────────────────────
  const registryEntry = getRegistry().components.find((component) => component.id === config.id);
  if (!registryEntry) {
    addWarning('registry', `"${config.id}" is not in the devkit components.json`, 'add an entry (README catalogue + port allocation)');
  } else {
    if (registryEntry.port) {
      const registryPorts = getPortsForBlock(registryEntry.port);
      const mismatchedPorts = ['dev', 'image'].filter((portName) => registryPorts[portName] !== config.ports[portName]);
      if (mismatchedPorts.length) {
        addError(
          'registry',
          mismatchedPorts.map((portName) => `ports.${portName} ${config.ports[portName]} ≠ registry ${registryPorts[portName]}`).join('; '),
          `set package.json#kmwc.ports to { "dev": ${registryPorts.dev}, "image": ${registryPorts.image} } (components.json port block ${registryEntry.port})`
        );
      } else addPass('registry', `ports match the registry (dev ${config.ports.dev}, image ${config.ports.image})`);
      checkPorts(config, registryEntry.port, { addPass, addWarning, addError });
    }
    if (registryEntry.prefix && config.prefix && registryEntry.prefix !== config.prefix) {
      addError('registry', `kmwc.prefix "${config.prefix}" ≠ registry prefix "${registryEntry.prefix}"`, 'use the reserved prefix');
    }
  }

  // ── library output names ─────────────────────────────────────────────────
  if (config.hasPackageConfig && config.library.shouldBuild) {
    const outputMismatches = getLibraryOutputMismatches(config.packageJson, config.library);
    for (const { field, target } of outputMismatches) {
      addError(
        'library',
        `package.json#${field} → ${target}, but the library build emits ${getLibraryOutputPaths(config.library).join(', ')}`,
        'set kmwc.library.fileName / cssFileName to the published names (or fix the package.json target)'
      );
    }
    if (!outputMismatches.length) addPass('library', 'package.json targets match the library build outputs');
  }

  // ── core's default loader class ──────────────────────────────────────────
  if (config.prefix && config.kind !== LIBRARY_KIND) checkLoaderClass(config, { addPass, addWarning, addError });

  // ── variable manifest (what `kmwc check-vars` checks; it only runs in the build) ──
  if (config.hasPackageConfig) checkVariableManifest(config, { addPass, addWarning, addError });

  // ── analytics ────────────────────────────────────────────────────────────
  const plausibleSiteId = loadPlausibleSiteId(config.root);
  const sharingRepoIds = loadSharedPlausibleSiteIds(config, getRegistry(), plausibleSiteId);
  if (sharingRepoIds.length) {
    addError(
      'analytics',
      `Plausible site id ${plausibleSiteId} is also used by ${sharingRepoIds.join(', ')} — one site's traffic is counted as the other's`,
      "set kmwc.analytics.plausibleSiteId to this site's own id"
    );
  } else if (plausibleSiteId) addPass('analytics', `Plausible site id ${plausibleSiteId} is this repo's own`);

  // ── package contents ─────────────────────────────────────────────────────
  if (doctorConfig.shouldCheckPackage !== false) checkPackageContents(config, { addPass, addWarning, addError });

  // ── rulebook suites ──────────────────────────────────────────────────────
  if (doctorConfig.shouldRunRulebook !== false) checkRulebook(config, { addPass, addWarning, addError });

  return results;
}

/** Ports: script --port flags, own configs and docs outside the block, siblings inside it. */
function checkPorts(config, portBlock, { addPass, addWarning, addError }) {
  const [firstPort, lastPort] = getPortBlockRange(portBlock);
  const blockLabel = `${firstPort}–${lastPort}`;
  const scriptPortMismatches = getScriptPortMismatches(config.packageJson.scripts, config.ports);
  for (const { scriptName, port, expectedPort } of scriptPortMismatches) {
    addError('ports', `script "${scriptName}" pins --port ${port}; kmwc.ports gives ${expectedPort}`, `drop the --port flag (the preset reads kmwc.ports)`);
  }
  const ownStrayPorts = loadOwnPortsOutsideBlock(config, portBlock).filter(({ file }) => !file.startsWith('package.json#scripts.'));
  for (const { port, file } of ownStrayPorts) addError('ports', `${file} uses port ${port}, outside this repo's block ${blockLabel}`, 'take ports from kmwc.ports (the devkit presets do)');
  const siblingCollisions = loadSiblingPortCollisions(config, getRegistry());
  for (const { id, port, file } of siblingCollisions) {
    addError('ports', `${id} uses port ${port} (${file}) — inside this repo's block ${blockLabel}`, `move ${id} to its own components.json block`);
  }
  const stalePortMentions = loadStalePortMentions(config.root, portBlock);
  if (stalePortMentions.length) {
    addWarning(
      'ports',
      `docs mention ports outside ${blockLabel}: ${stalePortMentions.map(({ file, port }) => `${file} ${port}`).join(', ')}`,
      `update them to ${getPortsForBlock(portBlock).dev} (dev) / ${getPortsForBlock(portBlock).image} (image); a doc that names other repos' ports on purpose gets <!-- ${OTHER_PORTS_MARKER}: why -->`
    );
  }
  if (!scriptPortMismatches.length && !ownStrayPorts.length && !siblingCollisions.length && !stalePortMentions.length) {
    addPass('ports', `scripts, configs, docs and sibling repos keep to block ${blockLabel}`);
  }
}

/**
 * The CSS styles the loader class the INSTALLED core draws. Core 6d6b768 renamed
 * `<prefix>-loader` → `<prefix>__loader` with no overlap release; renaming the CSS
 * before (or after) the core bump leaves the default loader unstyled, and no rulebook
 * check sees that (a VALIDATION-NOTES `## C-NC-8` even hides a leftover old class).
 */
function checkLoaderClass(config, { addPass, addWarning, addError }) {
  const coreLoader = loadCoreLoader(config.root);
  if (!coreLoader?.separator) return;
  const coreClassName = `${config.prefix}${coreLoader.separator}loader`;
  const { isCoreClassStyled, renamedClasses, collidingClasses } = getLoaderClassVerdict(coreLoader.separator, loadStyledLoaderClasses(config.root, config.prefix));
  for (const { file, className } of collidingClasses) {
    addWarning(
      'loader',
      `${file} styles .${className} next to core's .${coreClassName} — from core 6d6b768 on, core draws its default loader as <span class="${className}"> and it picks up these rules`,
      `rename the component's own .${className} element (e.g. .${config.prefix}__loading) in the same change as the core bump`
    );
  }
  for (const { file, className } of renamedClasses) {
    addError(
      'loader',
      `${file} styles .${className}, but core ${coreLoader.version} draws the default loader as <span class="${coreClassName}"> — it renders unstyled`,
      coreLoader.separator === '__'
        ? `rename .${className} → .${coreClassName} (CSS, tests, docs; keep the --${config.prefix}-loader-* tokens)`
        : `keep .${coreClassName} until the component builds on a core that draws <prefix>__loader, then rename in the same change`
    );
  }
  if (isCoreClassStyled && !renamedClasses.length) addPass('loader', `CSS styles .${coreClassName}, the class core ${coreLoader.version} draws`);
}

/** The variable manifest matches the CSS — the same verdict as `kmwc check-vars` (undocumented = warning). */
function checkVariableManifest(config, { addPass, addWarning, addError }) {
  let manifestVerdict;
  try {
    manifestVerdict = loadManifestVerdict(config);
  } catch (error) {
    addError('vars', `kmwc check-vars can't run: ${error.message}`, 'fix kmwc.cssVariables (sources / manifest / prefix)');
    return;
  }
  const { verdict, prefix, skippedReason } = manifestVerdict;
  if (skippedReason) return;
  const fixHint = 'edit the manifest to match the CSS (npm run check:vars lists every name)';
  const listNames = (names) => names.map((name) => `--${name}`).join(', ');
  if (verdict.missingBaseVariables.length) addError('vars', `--base-* read in CSS but missing from the manifest: ${listNames(verdict.missingBaseVariables)}`, fixHint);
  if (verdict.unusedBaseVariables.length) addError('vars', `--base-* in the manifest but not read in CSS: ${listNames(verdict.unusedBaseVariables)}`, fixHint);
  if (verdict.unusedComponentVariables.length) addError('vars', `--${prefix}-* in the manifest but not in CSS: ${listNames(verdict.unusedComponentVariables)}`, fixHint);
  if (verdict.undocumentedComponentVariables.length) {
    addWarning('vars', `--${prefix}-* in CSS but missing from the manifest: ${listNames(verdict.undocumentedComponentVariables)}`, `${fixHint}; runtime internals go in kmwc.cssVariables.internalVariables`);
  }
  const isInSync = !['missingBaseVariables', 'unusedBaseVariables', 'unusedComponentVariables', 'undocumentedComponentVariables'].some((key) => verdict[key].length);
  if (isInSync) addPass('vars', `variable manifest in sync — ${verdict.counts.base} base, ${verdict.counts.component} component vars`);
}

/** Packed paths that break PACKAGE_LEAK_RULES → [{ path, label }]. Pure — exported for tests. */
export function getPackageLeaks(packedPaths) {
  return packedPaths
    .map((packedPath) => packedPath.replace(/\\/g, '/').replace(/^package\//, ''))
    .flatMap((packedPath) => {
      const leakRule = PACKAGE_LEAK_RULES.find((rule) => rule.pattern.test(packedPath));
      return leakRule ? [{ path: packedPath, label: leakRule.label }] : [];
    });
}

/** The file list `npm publish` would ship (no lifecycle scripts, nothing written). */
function getPackedPaths(config) {
  const packResult = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: config.root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (packResult.error || packResult.status !== 0) return null;
  const packReport = JSON.parse(packResult.stdout.slice(packResult.stdout.indexOf('[')));
  return packReport[0].files.map((file) => file.path);
}

function checkPackageContents(config, { addPass, addWarning, addError }) {
  let packedPaths;
  try {
    packedPaths = getPackedPaths(config);
  } catch {
    packedPaths = null;
  }
  if (!packedPaths) {
    addWarning('package', 'npm pack --dry-run failed — package contents not checked');
    return;
  }
  const packageLeaks = getPackageLeaks(packedPaths);
  for (const packageLeak of packageLeaks) {
    addError(
      'package',
      `${packageLeak.path} would be published (${packageLeak.label})`,
      `exclude it in package.json "files" (e.g. ${PACKAGE_FILES_EXCLUSIONS.map((exclusion) => `"${exclusion}"`).join(', ')}) or narrow the glob`
    );
  }
  if (!packageLeaks.length) addPass('package', `${packedPaths.length} packed file(s), no dev-only files`);
}

function checkRulebook(config, { addPass, addWarning, addError }) {
  if (!existsSync(config.rulebook.path)) {
    addWarning('rulebook', `rulebook not found at ${config.rulebook.path} — rulebook checks skipped`, 'check out BlissFramework or set KMWC_RULEBOOK_PATH / kmwc.rulebook.path');
    return;
  }
  const skippedSuites = new Set(config.rulebook.skippedChecks);
  const acceptedCheckIds = loadAcceptedCheckIds(config.root);
  const suites = getRulebookSuites(config.kind);
  if (suites.length < RULEBOOK_SUITES.length) {
    const componentOnlySuiteNames = RULEBOOK_SUITES.filter((suite) => !suites.includes(suite)).map((suite) => suite.name);
    addPass('rulebook', `${config.kind}: component-only suites not run (${componentOnlySuiteNames.join(', ')})`);
  }
  for (const suite of suites) {
    if (skippedSuites.has(suite.name)) continue;
    if (!existsSync(join(config.rulebook.path, `${suite.name}.checks.sh`))) continue;
    const suiteResult = runRulebookSuite(config, suite);
    if (suiteResult.error) {
      addWarning('rulebook', `cannot run bash (${suiteResult.error.code}) — rulebook checks skipped`, 'install Git Bash / run from a POSIX shell');
      return;
    }
    const checkName = `rulebook:${suite.name}`;
    const failures = getSuiteFailures(suiteResult.stdout);
    // A suite passes with exit 0 and fails with exit 1 + FAIL lines. Anything else (2 = usage,
    // 127 = the script wasn't found — WSL's bash on a C:/ path) means it never ran: say so,
    // never count it as a pass.
    const hasRun = suiteResult.status === 0 || (suiteResult.status === 1 && failures.length > 0);
    if (!hasRun) {
      const reason = mapToPlainText(suiteResult.stderr || suiteResult.stdout).trim().split(/\r?\n/)[0] || 'no output';
      addWarning(checkName, `suite could not run (exit ${suiteResult.status}): ${reason}`, `bash used: ${getBashPath()} — set KMWC_BASH to Git for Windows' bash.exe if this is WSL's`);
      continue;
    }
    for (const failure of failures) {
      // An architectural decision recorded in VALIDATION-NOTES.md (the rulebook's accepted-deviation file).
      if (acceptedCheckIds.has(failure.checkId)) addPass(checkName, `${failure.checkId} accepted deviation (${VALIDATION_NOTES_FILE}): ${failure.reason}`);
      else addError(checkName, `${failure.checkId} ${failure.reason}`, `see ${suite.name}.checks.md → ${failure.checkId}`);
    }
    if (!failures.length) addPass(checkName, 'all auto checks pass');
  }
}

export async function run(args) {
  const config = getKmwcConfig(args.root);
  const results = checkComponent(config, { shouldRunRulebook: !args['no-rulebook'], shouldCheckPackage: !args['no-pack'] });
  const errorCount = results.filter((result) => result.level === 'error').length;
  const warningCount = results.filter((result) => result.level === 'warning').length;

  if (args.json) {
    console.log(JSON.stringify({ id: config.id, errorCount, warningCount, results }, null, 2));
    return errorCount ? 1 : 0;
  }

  const LEVEL_ICONS = { pass: '✓', warning: '⚠', error: '✗' };
  console.log(`kmwc doctor — ${config.packageName}${config.kind === 'component' ? '' : ` [${config.kind}]`} (${config.root})\n`);
  for (const result of results) {
    if (result.level === 'pass' && !args.verbose) continue;
    console.log(`${LEVEL_ICONS[result.level]} [${result.checkName}] ${result.message}${result.fixHint ? `\n    → ${result.fixHint}` : ''}`);
  }
  const acceptedCount = results.filter((result) => result.level === 'pass' && result.message.includes(`accepted deviation (${VALIDATION_NOTES_FILE})`)).length;
  if (acceptedCount && !args.verbose) console.log(`ℹ ${acceptedCount} rulebook failure(s) accepted in ${VALIDATION_NOTES_FILE} (--verbose lists them)`);
  console.log(`\n${errorCount ? '✗' : '✓'} ${errorCount} error(s), ${warningCount} warning(s)${args.verbose ? '' : ' (--verbose lists passing checks)'}`);
  return errorCount ? 1 : 0;
}
