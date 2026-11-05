/**
 * Doctor end to end: fixture repos on disk → checkComponent() / run(). The pure helpers have
 * their own tests in devkit.test.js; these cover the wiring — which finding each broken repo
 * produces, at which level, and that a healthy repo comes out clean.
 *
 * The fixture is registered as web-multiselect (prefix `ms`, block 12100) so the registry and
 * port checks run. The rulebook is a stand-in directory whose `.checks.sh` prints what the
 * fixture's `rulebook-output.txt` says — no BlissFramework checkout needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { getKmwcConfig } from '../src/config.js';
import { getSyncPlan, getScriptsPlan } from '../src/cli/sync-plan.js';
import { checkComponent, run } from '../src/cli/commands/doctor.js';

const FIXTURE_ID = 'web-multiselect';
const RULEBOOK_SCRIPT = [
  '#!/usr/bin/env bash',
  'output="$1/rulebook-output.txt"',
  '[ -f "$output" ] && cat "$output"',
  'exit "$(cat "$1/rulebook-exit.txt" 2>/dev/null || echo 0)"',
  '',
].join('\n');

const HEALTHY_PACKAGE_JSON = {
  name: `@keenmate/${FIXTURE_ID}`,
  version: '1.0.0',
  type: 'module',
  files: ['dist', '!**/CLAUDE.md', '!**/.claude'],
  devDependencies: { '@keenmate/web-components-devkit': '^1.0.0-rc10', vite: '^7.0.0' },
  kmwc: { title: 'Web Multiselect', prefix: 'ms', ports: { dev: 12100, image: 12110 } },
};

const HEALTHY_FILES = {
  'vite.config.ts': "import { defineComponentConfig } from '@keenmate/web-components-devkit/vite';\nexport default defineComponentConfig();\n",
  'examples-basic.html': '<meta name="kmwc:title" content="Basic">\n<h2>BU01 · Hello</h2>\n<div class="card">x</div>\n',
  'src/css/multiselect.css': '.ms { --ms-gap: 4px; gap: var(--ms-gap); color: var(--base-text-color); }\n.ms-loader { inline-size: 1em; }\n',
  'component-variables.manifest.json': JSON.stringify({ prefix: 'ms', baseVariables: [{ name: 'base-text-color' }], componentVariables: [{ name: 'ms-gap' }] }),
  'node_modules/@keenmate/web-components-core/package.json': JSON.stringify({ name: '@keenmate/web-components-core', version: '1.0.0-rc17' }),
  'node_modules/@keenmate/web-components-core/dist/dom/render-loader.js': 'span.className = `${prefix}-loader`;\n',
};

/** A repo in a fresh workspace: healthy files + generated files + standard scripts, then `files` / `packageJson` on top. */
function createRepo({ packageJson = {}, files = {}, kmwc = {}, isSynced = true } = {}) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'kmwc-doctor-'));
  const root = join(workspaceRoot, FIXTURE_ID);
  const rulebookPath = join(workspaceRoot, 'rulebook');
  const writeFile = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const fullPackageJson = { ...HEALTHY_PACKAGE_JSON, ...packageJson, kmwc: { ...HEALTHY_PACKAGE_JSON.kmwc, ...kmwc } };
  if (packageJson.kmwc === null) delete fullPackageJson.kmwc;
  writeFile('package.json', JSON.stringify(fullPackageJson));
  for (const [path, text] of Object.entries(HEALTHY_FILES)) writeFile(path, text);

  if (isSynced && fullPackageJson.kmwc) {
    const config = getKmwcConfig(root);
    for (const planItem of getSyncPlan(config)) writeFile(planItem.path, planItem.expectedText);
    writeFile('package.json', JSON.stringify({ ...fullPackageJson, scripts: { ...getScriptsPlan(config).missingScripts, ...fullPackageJson.scripts } }));
  }
  for (const [path, text] of Object.entries(files)) {
    if (text === null) rmSync(join(root, path), { force: true });
    else writeFile(path, text);
  }

  mkdirSync(rulebookPath);
  for (const suiteName of ['readme-structure', 'naming-conventions']) writeFileSync(join(rulebookPath, `${suiteName}.checks.sh`), RULEBOOK_SCRIPT);
  return { workspaceRoot, root, rulebookPath };
}

/** checkComponent on a fixture → { errors, warnings, passes } as "[check] message" lines. */
function checkRepo(repo, { shouldCheckPackage = false, shouldRunRulebook = false, rulebookPath = repo.rulebookPath } = {}) {
  const config = getKmwcConfig(repo.root);
  config.rulebook.path = rulebookPath;
  const results = checkComponent(config, { shouldCheckPackage, shouldRunRulebook });
  const getLines = (level) => results.filter((result) => result.level === level).map((result) => `[${result.checkName}] ${result.message}`);
  return { errors: getLines('error'), warnings: getLines('warning'), passes: getLines('pass'), results };
}

/** Run `callback` on a fresh fixture and remove it afterwards — after the promise settles for an async callback. */
function withRepo(repoConfig, callback) {
  const repo = createRepo(repoConfig);
  const removeRepo = () => rmSync(repo.workspaceRoot, { recursive: true, force: true });
  let result;
  try {
    result = callback(repo);
  } catch (error) {
    removeRepo();
    throw error;
  }
  if (result instanceof Promise) return result.finally(removeRepo);
  removeRepo();
  return result;
}

const findLine = (lines, pattern) => lines.find((line) => pattern.test(line));

test('doctor e2e: a healthy repo has no errors and no warnings — package and rulebook included', () => {
  withRepo({}, (repo) => {
    const { errors, warnings, passes } = checkRepo(repo, { shouldCheckPackage: true, shouldRunRulebook: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    for (const checkName of ['config', 'deps', 'vite', 'legacy', 'pages', 'sync', 'registry', 'ports', 'loader', 'vars', 'package', 'rulebook:readme-structure']) {
      assert.ok(passes.some((line) => line.startsWith(`[${checkName}]`)), `a pass for ${checkName}`);
    }
  });
});

test('doctor e2e: config and dependencies', () => {
  withRepo({ packageJson: { kmwc: null, devDependencies: { vite: '^5.4.0' } }, isSynced: false }, (repo) => {
    const { errors } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[config\] package\.json has no "kmwc" section/));
    assert.ok(findLine(errors, /^\[deps\] @keenmate\/web-components-devkit is not a devDependency/));
    assert.ok(findLine(errors, /^\[deps\] vite \^5\.4\.0 — the standard is \^7/));
  });
  withRepo({ kmwc: { title: '', prefix: '', ports: {} } }, (repo) => {
    const { warnings } = checkRepo(repo);
    assert.ok(findLine(warnings, /^\[config\] kmwc\.title not set/));
    assert.ok(findLine(warnings, /^\[config\] kmwc\.prefix not set/));
    assert.ok(findLine(warnings, /^\[config\] kmwc\.ports\.dev not set/));
  });
});

test('doctor e2e: configs off the presets — the old UMD global is named before the switch', () => {
  const files = {
    'vite.config.ts': "export default { build: { lib: { entry: 'src/index.ts', name: 'MultiSelect' } } };\n",
    'playwright.config.ts': 'export default { use: { baseURL: "http://localhost:12100" } };\n',
  };
  withRepo({ files }, (repo) => {
    const { errors, warnings } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[vite\] vite\.config\.ts doesn't use the devkit preset/));
    assert.ok(findLine(errors, /^\[vite\] the UMD global is "MultiSelect" today; the preset would make it "WebMultiselect"/));
    assert.ok(findLine(warnings, /^\[playwright\] playwright\.config\.ts doesn't use the devkit preset/));
  });
  withRepo({ files: { 'vite.config.ts': null } }, (repo) => {
    assert.ok(findLine(checkRepo(repo).errors, /^\[vite\] no vite\.config\.\*/));
  });
});

test('doctor e2e: legacy files and pages — helpers, boilerplate, kit duplicates, hard-coded colours', () => {
  const files = {
    'examples-shared.css': 'body {}',
    'examples-old.html': '<!doctype html><html><head><link rel="stylesheet" href="examples-shared.css"></head><body><header><a class="back-link" href="index.html">←</a></header></body></html>',
    'examples-colours.html': '<meta name="kmwc:title" content="C">\n<style>.pill { padding: 0; } .panel { background: #fff; }</style>\n<span style="color: white">x</span>\n<b data-kmwc-fixed-colors style="color: white">ok</b>',
  };
  withRepo({ files }, (repo) => {
    const { errors, warnings } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[legacy\] examples-shared\.css is a local copy of a devkit-owned file/));
    assert.ok(findLine(errors, /^\[pages\] examples-old\.html still references examples-shared\.css/));
    assert.ok(findLine(warnings, /^\[pages\] 1 page\(s\) repeat the head\/header boilerplate: examples-old\.html/));
    assert.ok(findLine(warnings, /^\[pages\] examples-colours\.html: 1 rule\(s\) \/ style\(s\) the kit already covers — \.pill/));
    // Two literals warn; the element carrying data-kmwc-fixed-colors doesn't.
    assert.ok(findLine(warnings, /^\[pages\] examples-colours\.html: 2 hard-coded colour\(s\) that don't follow dark mode — \.panel \{ background: #fff \}; style="color: white"$/));
  });
});

test('doctor e2e: generated files and standard scripts', () => {
  withRepo({ files: { Makefile: 'edited\n', 'CLAUDE.md': '# CLAUDE.md\n<!-- kmwc:devkit:start — managed by `kmwc sync`, do not edit inside -->\nold\n<!-- kmwc:devkit:end -->\n' }, packageJson: { scripts: { dev: 'vite --open' } } }, (repo) => {
    const { errors, warnings } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[sync\] Makefile out of sync/));
    assert.ok(findLine(warnings, /^\[sync\] CLAUDE\.md devkit block out of sync/));
    assert.ok(findLine(warnings, /^\[scripts\] "dev" is "vite --open", standard is/));
  });
  withRepo({ files: { 'CLAUDE.md': '# CLAUDE.md\nno devkit block\n', Dockerfile: null } }, (repo) => {
    const { errors } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[sync\] Dockerfile missing/));
    // No block at all is worse than a stale one: an error.
    assert.ok(findLine(errors, /^\[sync\] CLAUDE\.md devkit block out of sync/));
  });
  withRepo({ isSynced: false }, (repo) => {
    assert.ok(findLine(checkRepo(repo).warnings, /^\[scripts\] missing standard scripts: /));
  });
});

test('doctor e2e: registry and ports — block, prefix, scripts, configs, docs, siblings', () => {
  withRepo({ kmwc: { prefix: 'xx', ports: { dev: 12200, image: 12210 } } }, (repo) => {
    const { errors } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[registry\] ports\.dev 12200 ≠ registry 12100; ports\.image 12210 ≠ registry 12110/));
    assert.ok(findLine(errors, /^\[registry\] kmwc\.prefix "xx" ≠ registry prefix "ms"/));
  });
  const files = {
    'README.md': 'Run it: the dev server listens on port 21111.\n',
    'docs/old-plan.md': '<!-- kmwc-other-ports: a dated cross-repo plan -->\nweb-treeview ran on port 12300.\n',
    'playwright.config.ts': "import { definePlaywrightConfig } from '@keenmate/web-components-devkit/playwright';\nexport default definePlaywrightConfig({ webServer: { port: 4000 } });\n",
  };
  withRepo({ files, packageJson: { scripts: { dev: 'vite --port 21111' } } }, (repo) => {
    // A sibling checkout inside this repo's block.
    mkdirSync(join(repo.workspaceRoot, 'web-treeview'));
    writeFileSync(
      join(repo.workspaceRoot, 'web-treeview', 'package.json'),
      JSON.stringify({ name: '@keenmate/web-treeview', scripts: { dev: 'vite --port 12150' }, kmwc: { analytics: { plausibleSiteId: 'pa-shared' } } })
    );
    const packagePath = join(repo.root, 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    writeFileSync(packagePath, JSON.stringify({ ...packageJson, kmwc: { ...packageJson.kmwc, analytics: { plausibleSiteId: 'pa-shared' } } }));
    const { errors, warnings } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[ports\] script "dev" pins --port 21111; kmwc\.ports gives 12100/));
    assert.ok(findLine(errors, /^\[ports\] playwright\.config\.ts uses port 4000, outside this repo's block 12100–12199/));
    assert.ok(findLine(errors, /^\[ports\] web-treeview uses port 12150 \(package\.json#scripts\.dev\) — inside this repo's block/));
    assert.ok(findLine(errors, /^\[analytics\] Plausible site id pa-shared is also used by web-treeview/));
    // README warns; the marked plan doesn't.
    assert.ok(findLine(warnings, /^\[ports\] docs mention ports outside 12100–12199: README\.md 21111$/));
  });
  withRepo({ packageJson: { name: '@keenmate/web-not-registered' } }, (repo) => {
    assert.ok(findLine(checkRepo(repo).warnings, /^\[registry\] "web-not-registered" is not in the devkit components\.json/));
  });
});

test('doctor e2e: package.json targets the library build does not emit', () => {
  withRepo({ packageJson: { main: './dist/other.umd.js' } }, (repo) => {
    assert.ok(findLine(checkRepo(repo).errors, /^\[library\] package\.json#main → dist\/other\.umd\.js, but the library build emits dist\/web-multiselect\.js/));
  });
});

test('doctor e2e: loader — a rename on the wrong side of the core bump errors, an own __loader warns', () => {
  const newCore = { 'node_modules/@keenmate/web-components-core/dist/dom/render-loader.js': 'span.className = `${prefix}__loader`;\n' };
  withRepo({ files: newCore }, (repo) => {
    assert.ok(findLine(checkRepo(repo).errors, /^\[loader\] src\/css\/multiselect\.css styles \.ms-loader, but core 1\.0\.0-rc17 draws the default loader as <span class="ms__loader">/));
  });
  withRepo({ files: { 'src/css/loading.css': '.ms__loader { display: flex; min-height: 4rem; }' } }, (repo) => {
    const { errors, warnings, passes } = checkRepo(repo);
    assert.equal(findLine(errors, /^\[loader\]/), undefined);
    assert.ok(findLine(warnings, /^\[loader\] src\/css\/loading\.css styles \.ms__loader next to core's \.ms-loader/));
    assert.ok(findLine(passes, /^\[loader\] CSS styles \.ms-loader, the class core 1\.0\.0-rc17 draws/));
  });
  // A library draws no loader of its own: not checked.
  withRepo({ files: newCore, kmwc: { kind: 'library' } }, (repo) => {
    assert.equal(checkRepo(repo).results.find((result) => result.checkName === 'loader'), undefined);
  });
});

test('doctor e2e: the variable manifest — dead entries error, undocumented ones warn, a bad source errors', () => {
  const manifest = { prefix: 'ms', baseVariables: [{ name: 'base-text-color' }, { name: 'base-gone' }], componentVariables: [{ name: 'ms-gap' }, { name: 'ms-dead' }] };
  withRepo({ files: { 'component-variables.manifest.json': JSON.stringify(manifest), 'src/css/extra.css': '.ms { padding: var(--ms-pad); border-color: var(--base-accent-color); }' } }, (repo) => {
    const { errors, warnings } = checkRepo(repo);
    assert.ok(findLine(errors, /^\[vars\] --base-\* read in CSS but missing from the manifest: --base-accent-color$/));
    assert.ok(findLine(errors, /^\[vars\] --base-\* in the manifest but not read in CSS: --base-gone$/));
    assert.ok(findLine(errors, /^\[vars\] --ms-\* in the manifest but not in CSS: --ms-dead$/));
    assert.ok(findLine(warnings, /^\[vars\] --ms-\* in CSS but missing from the manifest: --ms-pad$/));
  });
  withRepo({ kmwc: { cssVariables: { sources: ['src/missing'] } } }, (repo) => {
    assert.ok(findLine(checkRepo(repo).errors, /^\[vars\] kmwc check-vars can't run: cssVariables source not found/));
  });
  withRepo({ kmwc: { cssVariables: false } }, (repo) => {
    assert.equal(checkRepo(repo).results.find((result) => result.checkName === 'vars'), undefined);
  });
});

test('doctor e2e: package contents — dev-only files that would be published', () => {
  withRepo({ packageJson: { files: ['src'] }, files: { 'src/CLAUDE.md': '# notes', 'src/index.ts': 'export {};\n' } }, (repo) => {
    assert.ok(findLine(checkRepo(repo, { shouldCheckPackage: true }).errors, /^\[package\] src\/CLAUDE\.md would be published/));
  });
});

test('doctor e2e: rulebook — failures error, VALIDATION-NOTES accepts, a suite that cannot run warns', () => {
  const files = {
    'rulebook-output.txt': 'PASS C-RS-1 — fine\nFAIL C-RS-2 — README has no Install section\nFAIL C-RS-3 — no badges\n',
    'rulebook-exit.txt': '1',
    'VALIDATION-NOTES.md': '# Validation notes\n\n## C-RS-3 — badges live on the docs site\n\nC-RS-2 is mentioned in prose only.\n',
  };
  withRepo({ files }, (repo) => {
    const { errors, passes } = checkRepo(repo, { shouldRunRulebook: true });
    assert.ok(findLine(errors, /^\[rulebook:readme-structure\] C-RS-2 README has no Install section/));
    assert.ok(findLine(passes, /^\[rulebook:readme-structure\] C-RS-3 accepted deviation \(VALIDATION-NOTES\.md\): no badges/));
    assert.equal(findLine(errors, /C-RS-3/), undefined);
  });
  withRepo({ files: { 'rulebook-output.txt': 'usage: needs a prefix\n', 'rulebook-exit.txt': '2' } }, (repo) => {
    assert.ok(findLine(checkRepo(repo, { shouldRunRulebook: true }).warnings, /^\[rulebook:readme-structure\] suite could not run: usage: needs a prefix/));
  });
  withRepo({ kmwc: { rulebook: { skippedChecks: ['readme-structure', 'naming-conventions'] } }, files: { 'rulebook-output.txt': 'FAIL C-RS-2 — x\n', 'rulebook-exit.txt': '1' } }, (repo) => {
    assert.equal(findLine(checkRepo(repo, { shouldRunRulebook: true }).errors, /^\[rulebook/), undefined);
  });
  withRepo({}, (repo) => {
    const { warnings } = checkRepo(repo, { shouldRunRulebook: true, rulebookPath: join(repo.workspaceRoot, 'no-rulebook') });
    assert.ok(findLine(warnings, /^\[rulebook\] rulebook not found at .*no-rulebook — rulebook checks skipped/));
  });
  withRepo({ kmwc: { kind: 'library' } }, (repo) => {
    assert.ok(findLine(checkRepo(repo, { shouldRunRulebook: true }).passes, /^\[rulebook\] library: component-only suites not run \(component-structure, css-structure/));
  });
});

test('doctor e2e: run() prints the findings and exits 1 on an error, 0 when clean; --json reports counts', async () => {
  const captureConsole = async (callback) => {
    const lines = [];
    const { log, warn, error } = console;
    console.log = console.warn = console.error = (...parts) => lines.push(parts.join(' '));
    try {
      return { exitCode: await callback(), output: lines.join('\n') };
    } finally {
      Object.assign(console, { log, warn, error });
    }
  };
  const previousRulebookPath = process.env.KMWC_RULEBOOK_PATH;
  try {
    await withRepo({ files: { 'examples-shared.css': 'body {}' } }, async (repo) => {
      process.env.KMWC_RULEBOOK_PATH = repo.rulebookPath;
      const { exitCode, output } = await captureConsole(() => run({ root: repo.root, 'no-pack': true }));
      assert.equal(exitCode, 1);
      assert.match(output, /✗ \[legacy\] examples-shared\.css is a local copy of a devkit-owned file\n {4}→ delete it/);
      assert.match(output, /✗ 1 error\(s\), 0 warning\(s\) \(--verbose lists passing checks\)/);
      assert.doesNotMatch(output, /✓ \[/, 'passes are hidden without --verbose');

      const jsonRun = await captureConsole(() => run({ root: repo.root, 'no-pack': true, json: true }));
      const report = JSON.parse(jsonRun.output);
      assert.equal(jsonRun.exitCode, 1);
      assert.deepEqual([report.id, report.errorCount, report.warningCount], [FIXTURE_ID, 1, 0]);
    });
    await withRepo({ files: { 'rulebook-output.txt': 'FAIL C-RS-3 — no badges\n', 'rulebook-exit.txt': '1', 'VALIDATION-NOTES.md': '## C-RS-3 — on the docs site\n' } }, async (repo) => {
      process.env.KMWC_RULEBOOK_PATH = repo.rulebookPath;
      const { exitCode, output } = await captureConsole(() => run({ root: repo.root, 'no-pack': true }));
      assert.equal(exitCode, 0);
      // Both stand-in suites print the same output: one accepted failure each.
      assert.match(output, /ℹ 2 rulebook failure\(s\) accepted in VALIDATION-NOTES\.md \(--verbose lists them\)/);
      const verboseRun = await captureConsole(() => run({ root: repo.root, 'no-pack': true, verbose: true }));
      assert.match(verboseRun.output, /✓ \[rulebook:readme-structure\] C-RS-3 accepted deviation/);
      assert.match(verboseRun.output, /✓ 0 error\(s\), 0 warning\(s\)$/);
    });
  } finally {
    if (previousRulebookPath === undefined) delete process.env.KMWC_RULEBOOK_PATH;
    else process.env.KMWC_RULEBOOK_PATH = previousRulebookPath;
  }
});

// Keep the fixture honest: it must look like what `kmwc new` produces, not drift into its own shape.
test('doctor e2e: the healthy fixture uses the registry entry it claims', () => {
  const registry = JSON.parse(readFileSync(new URL('../components.json', import.meta.url), 'utf8'));
  const entry = registry.components.find((component) => component.id === FIXTURE_ID);
  assert.deepEqual([entry.prefix, entry.port], [HEALTHY_PACKAGE_JSON.kmwc.prefix, HEALTHY_PACKAGE_JSON.kmwc.ports.dev]);
});
