/**
 * kmwc doctor — check a component repo against the KeenMate standard.
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

const DEVKIT_PACKAGE_NAME = '@keenmate/web-components-devkit';
const LEGACY_PAGE_REFERENCES = ['examples-shared.css', 'examples-chapter-nav.js', 'examples-copy-link.js', 'examples-controls-store.js'];
const VITE_CONFIG_FILES = ['vite.config.ts', 'vite.config.mjs', 'vite.config.js'];
const PLAYWRIGHT_CONFIG_FILES = ['playwright.config.ts', 'playwright.config.mjs', 'playwright.config.js'];

/** Rulebook suites in the rulebook's canonical reading order; the prefix is passed where the script takes one. */
export const RULEBOOK_SUITES = [
  { name: 'component-structure', isPrefixed: false },
  { name: 'naming-conventions', isPrefixed: true },
  { name: 'css-structure', isPrefixed: true },
  { name: 'theme-container', isPrefixed: true },
  { name: 'base-variables', isPrefixed: true },
  { name: 'color-scheme', isPrefixed: true },
  { name: 'readme-structure', isPrefixed: false },
  { name: 'custom-elements-manifest', isPrefixed: false },
  { name: 'responsive-overlay', isPrefixed: true },
  { name: 'publish-command', isPrefixed: false },
];

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

function runRulebookSuite(config, suite) {
  const scriptPath = join(config.rulebook.path, `${suite.name}.checks.sh`).replace(/\\/g, '/');
  const scriptArgs = [scriptPath, config.root.replace(/\\/g, '/')];
  if (suite.isPrefixed && config.prefix) scriptArgs.push(config.prefix);
  return spawnSync('bash', scriptArgs, { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
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
    if (!config.prefix) addWarning('config', 'kmwc.prefix not set — rulebook suites run without a CSS prefix', 'set kmwc.prefix to the prefix reserved in base-variables.md');
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
    }
    if (registryEntry.prefix && config.prefix && registryEntry.prefix !== config.prefix) {
      addError('registry', `kmwc.prefix "${config.prefix}" ≠ registry prefix "${registryEntry.prefix}"`, 'use the reserved prefix');
    }
  }

  // ── package contents ─────────────────────────────────────────────────────
  if (doctorConfig.shouldCheckPackage !== false) checkPackageContents(config, { addPass, addWarning, addError });

  // ── rulebook suites ──────────────────────────────────────────────────────
  if (doctorConfig.shouldRunRulebook !== false) checkRulebook(config, { addPass, addWarning, addError });

  return results;
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
  for (const suite of RULEBOOK_SUITES) {
    if (skippedSuites.has(suite.name)) continue;
    if (!existsSync(join(config.rulebook.path, `${suite.name}.checks.sh`))) continue;
    const suiteResult = runRulebookSuite(config, suite);
    if (suiteResult.error) {
      addWarning('rulebook', `cannot run bash (${suiteResult.error.code}) — rulebook checks skipped`, 'install Git Bash / run from a POSIX shell');
      return;
    }
    const checkName = `rulebook:${suite.name}`;
    if (suiteResult.status === 2) {
      const reason = mapToPlainText(suiteResult.stderr || suiteResult.stdout).trim().split(/\r?\n/)[0];
      addWarning(checkName, `suite could not run: ${reason}`);
      continue;
    }
    const failures = getSuiteFailures(suiteResult.stdout);
    for (const failure of failures) addError(checkName, `${failure.checkId} ${failure.reason}`, `see ${suite.name}.checks.md → ${failure.checkId}`);
    if (!failures.length) addPass(checkName, suiteResult.status === 0 ? 'all auto checks pass' : `exit ${suiteResult.status}`);
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
  console.log(`kmwc doctor — ${config.packageName} (${config.root})\n`);
  for (const result of results) {
    if (result.level === 'pass' && !args.verbose) continue;
    console.log(`${LEVEL_ICONS[result.level]} [${result.checkName}] ${result.message}${result.fixHint ? `\n    → ${result.fixHint}` : ''}`);
  }
  console.log(`\n${errorCount ? '✗' : '✓'} ${errorCount} error(s), ${warningCount} warning(s)${args.verbose ? '' : ' (--verbose lists passing checks)'}`);
  return errorCount ? 1 : 0;
}
