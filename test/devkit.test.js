// Unit tests for the parts of the devkit that don't need a browser.
// (The examples kit is covered end-to-end by playground/e2e — `npm run test:e2e`.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mapKmwcConfig, getRegistryKind, getRegistry, getNextPortBlock, getPortRange, getPortsForBlock, getRulebookPath, DEVKIT_ROOT, PORT_BLOCK_SIZE, PACKAGE_FILES_EXCLUSIONS } from '../src/config.js';
import {
  getSyncPlan,
  renderTemplate,
  getTemplateVariables,
  getStandardScripts,
  updateClaudeBlock,
  CLAUDE_BLOCK_START,
  CLAUDE_BLOCK_END,
  GENERATED_MARK,
} from '../src/cli/sync-plan.js';
import { checkManifestVariables } from '../src/cli/commands/check-vars.js';
import { checkVersionForTag } from '../src/cli/commands/check-release.js';
import { getSuiteFailures, getPackageLeaks, getRulebookSuites, RULEBOOK_SUITES } from '../src/cli/commands/doctor.js';
import { checkPrefix, generatePackageJson, generatePrefix, getReservedPrefixes } from '../src/cli/commands/new.js';
import { renderCatalogue } from '../src/cli/commands/readme.js';
import { createExamplesPlugin } from '../src/vite/index.js';
import { parseArgs } from '../src/cli/args.js';
import {
  getAcceptedCheckIds,
  getLibraryOutputPaths,
  getLibraryOutputMismatches,
  getLegacyGlobalName,
  getScriptPortMismatches,
  getMentionedPorts,
  getPortBlockRange,
  loadSiblingPortCollisions,
  loadStalePortMentions,
  loadPlausibleSiteId,
  loadSharedPlausibleSiteIds,
  loadKitClassNames,
  getKitDuplicates,
  checkIsHardcodedColor,
  getHardcodedColors,
  getCoreLoaderSeparator,
  getStyledLoaderClasses,
  loadCoreLoader,
  loadStyledLoaderClasses,
} from '../src/cli/repo-checks.js';
import { parseWidths, getPageProblems, getSelectorSubject, loadPageRules, DEFAULT_WIDTHS } from '../src/cli/commands/check-pages.js';
import { CHAPTER_NAV_CLASSES, COPY_LINK_CLASSES, DEMO_CLASSES, INDEX_PAGE_CLASSES, SPOTLIGHT_CLASSES, THEME_SWITCH_CLASSES } from '../src/examples/constants.js';
import { generateChapterIndex, getPageChapters, getHeadingText } from '../src/vite/chapter-index.js';
import { searchChapters, checkMatchesAny, renderHighlightedText } from '../src/examples/chapter-search.js';
import { getMovedIndex } from '../src/examples/spotlight.js';
import { findSectionByHash, getChapterCode, mapToCodeKey } from '../src/examples/sections.js';
import { getExamplePages } from '../src/vite/index.js';
import { composePage, resolveIncludes, renderDemos, mapToDedentedText, checkIsFragment } from '../src/vite/page-composer.js';

const PLAYGROUND_ROOT = join(DEVKIT_ROOT, 'playground');
const createPackageJson = (packageConfig = {}) => ({ name: '@keenmate/web-sample', version: '1.2.3', description: 'A sample', kmwc: packageConfig });
const getPlaygroundConfig = () => mapKmwcConfig(JSON.parse(readFileSync(join(PLAYGROUND_ROOT, 'package.json'), 'utf8')), PLAYGROUND_ROOT);

test('config: defaults derive from the package', () => {
  const config = mapKmwcConfig(createPackageJson({ ports: { dev: 14000 } }), '/x');
  assert.equal(config.id, 'web-sample');
  assert.equal(config.title, 'Web Sample');
  assert.equal(config.tagline, 'A sample');
  assert.equal(config.library.globalName, 'WebSample');
  assert.equal(config.library.fileName, 'web-sample');
  assert.equal(config.library.cssFileName, 'style');
  assert.equal(config.library.shouldEmitTypes, true);
  assert.equal(config.ports.image, 14010);
  assert.equal(config.examples.storagePrefix, 'web-sample');
  assert.equal(config.image.name, 'registry.km8.es/web-sample-examples:prod');
  assert.equal(config.cssVariables.checkMode, 'declared');
});

test('config: the rulebook is found above the component, wherever the devkit is installed', () => {
  // <tmp>/Git/BlissFramework/guidelines/web-components + <tmp>/Git/KM/web-x/node_modules/… (an npm install).
  const treeRoot = mkdtempSync(join(tmpdir(), 'kmwc-rulebook-'));
  try {
    const rulebookPath = join(treeRoot, 'Git', 'BlissFramework', 'guidelines', 'web-components');
    const componentRoot = join(treeRoot, 'Git', 'KM', 'web-x');
    mkdirSync(rulebookPath, { recursive: true });
    mkdirSync(join(componentRoot, 'node_modules'), { recursive: true });
    assert.equal(getRulebookPath(componentRoot), rulebookPath);
    assert.equal(getRulebookPath(join(componentRoot, 'node_modules')), rulebookPath);
    const savedEnvPath = process.env.KMWC_RULEBOOK_PATH;
    delete process.env.KMWC_RULEBOOK_PATH;
    try {
      assert.equal(mapKmwcConfig(createPackageJson(), componentRoot).rulebook.path, rulebookPath);
      assert.equal(mapKmwcConfig(createPackageJson({ rulebook: { path: '../rules' } }), componentRoot).rulebook.path, join(treeRoot, 'Git', 'KM', 'rules'));
    } finally {
      if (savedEnvPath !== undefined) process.env.KMWC_RULEBOOK_PATH = savedEnvPath;
    }
    assert.equal(getRulebookPath(join(treeRoot, 'elsewhere')), getRulebookPath(tmpdir()), 'nothing above → whatever the real filesystem has (usually null)');
  } finally {
    rmSync(treeRoot, { recursive: true, force: true });
  }
});

test('registry: ids and prefixes unique; each kind numbers its port blocks by 100 inside its range', () => {
  const { components } = getRegistry();
  const ids = components.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');

  const prefixes = components.map((entry) => entry.prefix).filter(Boolean);
  assert.equal(new Set(prefixes).size, prefixes.length, 'duplicate prefix');

  // Per range: registry order, step PORT_BLOCK_SIZE from the range start, no gaps, within bounds.
  const nextBlockByRange = new Map();
  for (const entry of components) {
    const portRange = getPortRange(entry.kind);
    const expectedBlock = nextBlockByRange.get(portRange) ?? portRange.firstBlock;
    assert.equal(entry.port, expectedBlock, `${entry.id} breaks the ${portRange.kinds.join('/')} port sequence`);
    assert.ok(entry.port <= portRange.lastBlock, `${entry.id} overflows its port range`);
    assert.ok(!('ports' in entry) && !('status' in entry), `${entry.id} carries a retired field`);
    nextBlockByRange.set(portRange, expectedBlock + PORT_BLOCK_SIZE);
  }
  const componentCount = components.filter((entry) => entry.kind === 'component').length;
  assert.equal(getNextPortBlock(), getPortRange('component').firstBlock + componentCount * PORT_BLOCK_SIZE, 'a new component lands next to the components');
  const blockPorts = getPortsForBlock(12100);
  assert.deepEqual(blockPorts, { dev: 12100, preview: 12101, image: 12110 });
  for (const entry of components) {
    if (entry.for) assert.ok(ids.includes(entry.for), `${entry.id}.for → unknown "${entry.for}"`);
  }
});

test('templates: every placeholder resolves, Makefile recipes use tabs, publish is gated', () => {
  const variables = getTemplateVariables(mapKmwcConfig(createPackageJson({ ports: { dev: 14000 } }), '/x'));
  for (const templateName of readdirSync(join(DEVKIT_ROOT, 'templates')).filter((fileName) => fileName.endsWith('.tmpl'))) {
    const renderedText = renderTemplate(readFileSync(join(DEVKIT_ROOT, 'templates', templateName), 'utf8'), variables);
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(renderedText), `${templateName} has unresolved placeholders`);
    assert.ok(renderedText.includes(GENERATED_MARK), `${templateName} lacks the generated header`);
  }
  const makefileText = renderTemplate(readFileSync(join(DEVKIT_ROOT, 'templates', 'Makefile.tmpl'), 'utf8'), variables);
  assert.match(makefileText, /^help: .*\n\t@echo/m);
  assert.ok(!/^ {2,}(npm|npx|@|\$\(|-@)/m.test(makefileText), 'a recipe line is indented with spaces');
  assert.match(makefileText, /DEV_PORT\s+:= 14000/);
  assert.match(makefileText, /^publish:.*\n\tnpx kmwc check-release --tag latest/m);
  assert.match(makefileText, /^publish-rc:.*\n\tnpx kmwc check-release --tag rc/m);
});

test('templates: monorepo package.json paths copy into their directories', () => {
  const config = mapKmwcConfig(createPackageJson({ image: { packageJsonPaths: ['package.json', 'packages/a/package.json'] } }), '/x');
  assert.equal(getTemplateVariables(config).COPY_PACKAGE_JSONS, 'COPY package.json ./\nCOPY packages/a/package.json packages/a/');
});

test('CLAUDE.md block: inserted after the H1, replaced in place, idempotent', () => {
  const originalText = '# CLAUDE.md\n\nExisting guidance.\n';
  const updatedText = updateClaudeBlock(originalText);
  assert.ok(updatedText.startsWith('# CLAUDE.md\n\n' + CLAUDE_BLOCK_START));
  assert.ok(updatedText.includes('Existing guidance.'));
  assert.equal(updateClaudeBlock(updatedText), updatedText);

  const staleText = updatedText.replace(/Shared infrastructure/, 'OLD TEXT');
  assert.equal(updateClaudeBlock(staleText), updatedText);
  assert.ok(updateClaudeBlock(null).includes(CLAUDE_BLOCK_END));
});

test('sync plan: playground is in sync', () => {
  const driftedPaths = getSyncPlan(getPlaygroundConfig())
    .filter((planItem) => planItem.isChanged)
    .map((planItem) => planItem.path);
  assert.deepEqual(driftedPaths, []);
});

test('check-vars: declared-or-read vs consumed modes, input variables, internals, comments ignored', () => {
  const cssText = `
    /* --ms-ghost: 1px; var(--base-ghost) */
    :host { --ms-gap: 4px; --ms-internal-width: 0; color: var(--base-text-color, red); --_km-menu-bg: var(--ms-menu-bg); }
    .x { padding: var(--ms-pad, 2px); }`;
  const manifest = {
    baseVariables: [{ name: 'base-text-color' }, { name: 'base-dead' }],
    componentVariables: [{ name: 'ms-gap' }, { name: 'ms-gone' }, { name: 'ms-menu-bg' }],
  };
  // Default: declared OR read. --ms-menu-bg is an input (read, never declared) → alive;
  // --ms-pad is read with a fallback but undocumented.
  const declaredVerdict = checkManifestVariables({ cssText, manifest, prefix: 'ms', internalVariables: ['ms-internal-width'] });
  assert.deepEqual(declaredVerdict.unusedBaseVariables, ['base-dead']);
  assert.deepEqual(declaredVerdict.missingBaseVariables, []);
  assert.deepEqual(declaredVerdict.unusedComponentVariables, ['ms-gone']);
  assert.deepEqual(declaredVerdict.undocumentedComponentVariables, ['ms-pad']);

  const consumedVerdict = checkManifestVariables({ cssText, manifest, prefix: 'ms', checkMode: 'consumed' });
  assert.deepEqual(consumedVerdict.undocumentedComponentVariables, ['ms-pad']);
  assert.deepEqual(consumedVerdict.unusedComponentVariables, ['ms-gap', 'ms-gone']);
});

test('check-release: version must fit the dist-tag', () => {
  assert.equal(checkVersionForTag('1.2.0', 'latest'), null);
  assert.equal(checkVersionForTag('1.2.0-rc03', 'rc'), null);
  assert.match(checkVersionForTag('1.2.0-rc03', 'latest'), /pre-release/);
  assert.match(checkVersionForTag('1.2.0', 'rc'), /not an -rcN/);
  assert.match(checkVersionForTag('1.2.0-beta1', 'rc'), /not an -rcN/);
});

test('new: prefix intake — derivation, format, reservations', () => {
  assert.equal(generatePrefix('web-date-range-picker'), 'drp');
  assert.equal(generatePrefix('web-grid'), 'wg');
  assert.equal(generatePrefix('web-colorpicker'), null, 'ambiguous word count needs --prefix');

  const reservedPrefixes = getReservedPrefixes();
  for (const reservedPrefix of ['ms', 'drp', 'wtv', 'wg', 'cp', 'dz', 'kmwc']) assert.ok(reservedPrefixes.has(reservedPrefix), `${reservedPrefix} not reserved`);
  assert.match(checkPrefix('ms', reservedPrefixes), /already reserved/);
  assert.match(checkPrefix('x', reservedPrefixes), /2–4 lowercase/);
  assert.match(checkPrefix('Ab', reservedPrefixes), /2–4 lowercase/);
  assert.equal(checkPrefix('cpk', reservedPrefixes), null);
});

test('new --minimal: the overlay only replaces scaffold files, never adds new ones', () => {
  const getRelativeFiles = (root, directory = root) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? getRelativeFiles(root, join(directory, entry.name)) : [join(directory, entry.name).slice(root.length + 1)]
    );
  const scaffoldFiles = new Set(getRelativeFiles(join(DEVKIT_ROOT, 'templates', 'new')));
  for (const overlayFile of getRelativeFiles(join(DEVKIT_ROOT, 'templates', 'new-minimal'))) {
    assert.ok(scaffoldFiles.has(overlayFile), `templates/new-minimal/${overlayFile} has no counterpart in templates/new`);
  }
});

test('doctor: rulebook suite output is parsed into failures', () => {
  const suiteOutput = '\x1b[32m✅ PASS\x1b[0m C-CSS-1 ok\n\x1b[31m❌ FAIL\x1b[0m C-CSS-7 — 2 class(es) not BEM\n⏭  SKIP C-CSS-9 — n/a';
  assert.deepEqual(getSuiteFailures(suiteOutput), [{ checkId: 'C-CSS-7', reason: '2 class(es) not BEM' }]);
  assert.ok(RULEBOOK_SUITES.some((suite) => suite.name === 'publish-command'));
  assert.ok(RULEBOOK_SUITES.some((suite) => suite.name === 'example-pages'));
});

test('doctor: packed dev-only files are leaks; the scaffold excludes AI guidance', () => {
  const packedPaths = [
    'package/dist/web-sample.js', 'src/css/main.css', 'src/css/CLAUDE.md', 'CLAUDE.md', '.claude/commands/publish.md',
    'e2e/smoke.spec.ts', 'test/fixture.html', 'src/web-component.test.ts', 'examples-basic.html', 'partials/note.html',
    'docs/usage.md', 'README.md', 'LICENSE', 'component-variables.manifest.json', 'custom-elements.json',
  ];
  assert.deepEqual(
    getPackageLeaks(packedPaths).map((packageLeak) => packageLeak.path),
    ['src/css/CLAUDE.md', 'CLAUDE.md', '.claude/commands/publish.md', 'e2e/smoke.spec.ts', 'test/fixture.html', 'src/web-component.test.ts', 'examples-basic.html', 'partials/note.html']
  );
  const scaffoldFiles = generatePackageJson({ componentId: 'web-sample', packageName: '@keenmate/web-sample', tag: 'web-sample', prefix: 'ws', title: 'Web Sample', devPort: 12900 }).files;
  for (const exclusion of PACKAGE_FILES_EXCLUSIONS) assert.ok(scaffoldFiles.includes(exclusion), `scaffold "files" lacks ${exclusion}`);
  for (const exclusion of PACKAGE_FILES_EXCLUSIONS) assert.ok(JSON.parse(readFileSync(join(PLAYGROUND_ROOT, 'package.json'), 'utf8')).files.includes(exclusion));
});

test('package: every runtime export of a public entry is declared in its hand-written .d.ts', async () => {
  const packageExports = JSON.parse(readFileSync(join(DEVKIT_ROOT, 'package.json'), 'utf8')).exports;
  const typedEntries = Object.entries(packageExports).filter(([, target]) => typeof target === 'object' && target.types);
  assert.ok(typedEntries.length >= 4);
  for (const [entryName, target] of typedEntries) {
    const runtimeModule = await import(pathToFileURL(join(DEVKIT_ROOT, target.import)).href);
    const declarationText = readFileSync(join(DEVKIT_ROOT, target.types), 'utf8');
    const undeclaredNames = Object.keys(runtimeModule).filter(
      (exportName) => !new RegExp(`export\\s+(?:declare\\s+)?(?:const|function|class|let)\\s+${exportName}\\b`).test(declarationText)
    );
    assert.deepEqual(undeclaredNames, [], `${entryName}: exported at runtime but missing from ${target.types}`);
  }
});

test('kit: every generated class is kmwc-prefixed BEM', () => {
  const kitClassNames = [CHAPTER_NAV_CLASSES, COPY_LINK_CLASSES, DEMO_CLASSES, INDEX_PAGE_CLASSES, SPOTLIGHT_CLASSES, THEME_SWITCH_CLASSES].flatMap((classes) => Object.values(classes));
  for (const className of kitClassNames) {
    assert.match(className, /^kmwc-[a-z]+(-[a-z]+)*(__[a-z]+(-[a-z]+)*)?(--[a-z]+(-[a-z]+)*)?$/, `${className} is not kmwc BEM`);
  }
});

test('kit CSS: colour literals live only in tokens.css', () => {
  const cssDirectory = join(DEVKIT_ROOT, 'src', 'examples', 'css');
  for (const fileName of readdirSync(cssDirectory).filter((name) => name !== 'tokens.css')) {
    const cssText = readFileSync(join(cssDirectory, fileName), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(cssText), `${fileName} contains a colour literal`);
  }
});

test('kit never sets a --base-* variable: components on example pages keep their defaults', () => {
  // kmwc.theme and the kit tokens style the demo UI only (--kmwc-*); the kit may
  // read --base-*, never declare or set one, or every component would be themed.
  const kitFiles = [
    ...readdirSync(join(DEVKIT_ROOT, 'src', 'examples', 'css')).map((name) => join('src', 'examples', 'css', name)),
    ...readdirSync(join(DEVKIT_ROOT, 'src', 'examples')).filter((name) => name.endsWith('.js')).map((name) => join('src', 'examples', name)),
    ...readdirSync(join(DEVKIT_ROOT, 'src', 'vite')).filter((name) => name.endsWith('.js')).map((name) => join('src', 'vite', name)),
    join('templates', 'examples-layout.html'),
  ];
  for (const filePath of kitFiles) {
    const fileText = readFileSync(join(DEVKIT_ROOT, filePath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/(^|[{;\s])--base-[a-z0-9-]+\s*:/m.test(fileText), `${filePath} declares a --base-* variable`);
    assert.ok(!/setProperty\(\s*['"`]--base-/.test(fileText), `${filePath} sets a --base-* variable`);
  }
});

test('scaffold CSS never selects the host page: no universal or bare element selectors', () => {
  // The component stylesheet also reaches the page (index.ts imports it for the
  // FOUC rule), in a layer that beats @layer kmwc — an unscoped `*` or `input`
  // rule restyles every page. Allowed: :host…, the component tag, prefixed classes.
  const cssDirectories = ['templates/new/src/css', 'templates/new-minimal/src/css', 'playground/src/css'];
  for (const directory of cssDirectories) {
    for (const fileName of readdirSync(join(DEVKIT_ROOT, directory))) {
      const cssText = readFileSync(join(DEVKIT_ROOT, directory, fileName), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replaceAll('{{TAG}}', 'web-tag')
        .replace(/\{\{[A-Z_]+\}\}/g, 'x');
      for (const [, prelude] of cssText.matchAll(/([^{};]+)\{/g)) {
        const selectorList = prelude.trim();
        if (/^@|^(from|to|\d+%)/.test(selectorList)) continue;
        for (const selector of selectorList.split(',').map((part) => part.trim())) {
          const isPageWide = /^(\*|[a-z][a-z0-9]*)(?![-a-z0-9])/.test(selector);
          assert.ok(!isPageWide, `${directory}/${fileName}: "${selector}" reaches the host page`);
        }
      }
    }
  }
});

function getHtmlTransformer(pluginConfig, { command = 'serve', mode = 'development' } = {}) {
  const plugin = createExamplesPlugin(pluginConfig);
  plugin.configResolved({ command, mode, build: { outDir: 'dist-examples' } });
  return (html, path = '/examples-basic.html') => plugin.transformIndexHtml.handler(html, { path });
}

test('plugin: injects theme bootstrap, page config + kit into root pages only', () => {
  const transformHtml = getHtmlTransformer({ root: PLAYGROUND_ROOT });
  const pageHtml = '<!DOCTYPE html><html><head><title>x</title></head><body><p>hi</p></body></html>';

  const transformedHtml = transformHtml(pageHtml);
  assert.match(transformedHtml, /<head>\n<script>try\{var t=localStorage\.getItem\("kmwc:examples:theme"\)/);
  assert.match(transformedHtml, /<script>window\.__KMWC__=\{"id":"web-playground"/);
  assert.match(transformedHtml, /<script type="module">import 'virtual:kmwc-examples';<\/script>\n<\/body>/);
  assert.match(transformedHtml, /--kmwc-accent-color:#059669/);
  assert.ok(!transformedHtml.includes('plausible'), 'no analytics in dev');

  // No FOUC: the kit stylesheet is render-blocking — a <link> in <head> in dev, a
  // CSS import (Vite extracts it to a <head> <link>) in builds; never a script-only load.
  const headHtml = transformedHtml.slice(0, transformedHtml.indexOf('</head>'));
  assert.match(headHtml, /<link rel="stylesheet" href="\/@fs\/[^"]*\/src\/examples\/css\/style\.css">/);
  const builtHtml = getHtmlTransformer({ root: PLAYGROUND_ROOT }, { command: 'build', mode: 'examples' })(pageHtml);
  assert.ok(!builtHtml.includes('/@fs/'), 'no dev URL in builds');
  assert.match(builtHtml, /<script type="module">import '[^']*\/src\/examples\/css\/style\.css'; import 'virtual:kmwc-examples';<\/script>/);

  assert.equal(transformHtml(pageHtml, '/test/fixture.html'), pageHtml, 'nested pages untouched');
  const optedOutHtml = pageHtml.replace('<html>', '<html data-kmwc="off">');
  assert.equal(transformHtml(optedOutHtml), optedOutHtml, 'data-kmwc="off" opts out');
});

test('plugin: analytics only in builds, and only when configured', () => {
  assert.ok(!getPlaygroundConfig().analytics.plausibleSiteId, 'playground has no analytics id');
  const transformBuiltHtml = getHtmlTransformer({ root: PLAYGROUND_ROOT }, { command: 'build', mode: 'examples' });
  const transformedHtml = transformBuiltHtml('<html><head></head><body></body></html>');
  assert.ok(!transformedHtml.includes('plausible'));
  assert.match(transformedHtml, /"buildTimestamp":"\d{4}-\d\d-\d\dT\d\d:\d\dZ"/);
});

test('plugin: a configured Plausible id goes into built pages, first in <head>', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kmwc-'));
  try {
    writeFileSync(join(temporaryRoot, 'package.json'), JSON.stringify(createPackageJson({ analytics: { plausibleSiteId: 'pa-TEST123' } })));
    const pageHtml = '<html><head></head><body></body></html>';
    const builtHtml = getHtmlTransformer({ root: temporaryRoot }, { command: 'build', mode: 'examples' })(pageHtml);
    assert.match(builtHtml, /<head>\n<!-- Privacy-friendly analytics[^\n]*\n<script async src="https:\/\/stats\.keenmate\.services\/js\/pa-TEST123\.js">/);
    assert.ok(builtHtml.indexOf('pa-TEST123') < builtHtml.indexOf('__KMWC__'));
    assert.ok(!getHtmlTransformer({ root: temporaryRoot })(pageHtml).includes('pa-TEST123'), 'never in dev');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('plugin: "<head>" / "</body>" as page text never receive the injected snippets', () => {
  // web-multiselect's action-buttons page: a sed on /<head>/ put the Plausible snippet
  // (which opens with an HTML comment) into the page's module script → the script threw.
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kmwc-'));
  try {
    writeFileSync(join(temporaryRoot, 'package.json'), JSON.stringify(createPackageJson({ analytics: { plausibleSiteId: 'pa-TEST123' } })));
    const transformBuiltHtml = getHtmlTransformer({ root: temporaryRoot }, { command: 'build', mode: 'examples' });
    const scriptText = "// The <link> in <head> registers the font; </body> is just text here\nconsole.log(1);";
    const pageScript = `<script type="module">${scriptText}</script>`;
    const fragmentHtml = [
      '<meta name="kmwc:title" content="AB">',
      '<div class="card"><h2>AB04</h2><span title="Unicode glyphs — no <head> link needed">?</span></div>',
      pageScript,
    ].join('\n');
    const documentHtml = `<!-- copy this into <head> -->\n<html><head><title>x</title></head><body><header>h</header>${pageScript}</body></html>`;

    for (const builtHtml of [transformBuiltHtml(fragmentHtml), transformBuiltHtml(documentHtml)]) {
      assert.equal(builtHtml.split('pa-TEST123').length - 1, 1, 'snippet once');
      assert.equal(builtHtml.split('import \'virtual:kmwc-examples\'').length - 1, 1, 'kit once');
      assert.ok(builtHtml.includes(pageScript), 'page script untouched');
      assert.ok(builtHtml.indexOf('pa-TEST123') < builtHtml.indexOf('</head>'), 'snippet in <head>');
      assert.match(builtHtml, /virtual:kmwc-examples';<\/script>\n?<\/body><\/html>\s*$|virtual:kmwc-examples';<\/script>\n?<\/body>\s*<\/html>\s*$/);
    }

    // No <head> at all: prepended — never into <header>.
    const headlessHtml = transformBuiltHtml('<html><body><header>h</header></body></html>');
    assert.ok(headlessHtml.startsWith('<!-- Privacy-friendly analytics'));
    assert.match(headlessHtml, /<header>h<\/header>/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

const createPartialReader =(partials) => (absolutePath, displayPath) => {
  if (!(displayPath in partials)) throw new Error(`no partial ${displayPath}`);
  return partials[displayPath];
};

test('composer: includes — parameters, content, nesting, comments, cycles', () => {
  const readFile = createPartialReader({
    'partials/card.html': '<!-- usage: <kmwc-include src="partials/card.html"> --><div class="card" id="{{cardId}}"><kmwc-include src="partials/title.html" text="{{heading}}"></kmwc-include>{{content}} {{unknown}}</div>',
    'partials/title.html': '<h2>{{text}}</h2>',
    'partials/loop.html': '<kmwc-include src="partials/loop.html"></kmwc-include>',
  });
  const html = resolveIncludes('<kmwc-include src="partials/card.html" card-id="c1" heading="Hello">body</kmwc-include>', { root: '/x', readFile });
  assert.match(html, /<div class="card" id="c1"><h2>Hello<\/h2>body \{\{unknown\}\}<\/div>/);
  assert.match(html, /<!-- usage: <kmwc-include src="partials\/card.html"> -->/, 'includes inside comments are left alone');
  assert.throws(() => resolveIncludes('<kmwc-include src="partials/loop.html"/>', { root: '/x', readFile }), /include cycle/);
  assert.throws(() => resolveIncludes('<kmwc-include></kmwc-include>', { root: '/x', readFile }), /without src/);
});

test('composer: demos render live markup + escaped, dedented code', () => {
  const html = renderDemos(`<kmwc-demo>
        <web-x id="a" flag></web-x>
        <script type="module" data-kmwc-show>
            run();
        </script>
    </kmwc-demo>`);
  assert.match(html, /<div class="kmwc-demo__preview demo-area">\s*<web-x id="a" flag><\/web-x>/);
  assert.match(html, /data-language="html"><pre><code>&lt;web-x id=&quot;a&quot; flag&gt;&lt;\/web-x&gt;<\/code>/);
  assert.match(html, /data-language="js"><pre><code>run\(\);<\/code>/);
  assert.match(html, /<script type="module">\s*run\(\);\s*<\/script>/, 'shown script still runs, without the marker attribute');
  assert.ok(!/<script[^>]*data-kmwc-show/.test(html));
  assert.equal(mapToDedentedText('\n    a\n      b\n'), 'a\n  b');
});

test('composer: fragments get the layout, full documents pass through', () => {
  const config = mapKmwcConfig(createPackageJson({ title: 'Web Sample' }), '/x');
  const pageHtml = composePage(
    '<meta name="kmwc:title" content="Basics">\n<meta name="kmwc:subtitle" content="Sub">\n<meta name="kmwc:body-class" content="dark-output">\n<link rel="stylesheet" href="local.css">\n<div class="card">x</div>',
    { config, pagePath: '/examples-basics.html' }
  );
  assert.match(pageHtml, /<title>Basics — Web Sample<\/title>/);
  assert.match(pageHtml, /<head>[\s\S]*<script type="module" src="\/src\/index.ts"><\/script>[\s\S]*<link rel="stylesheet" href="local.css">[\s\S]*<\/head>/);
  assert.match(pageHtml, /<body class="dark-output">/);
  assert.match(pageHtml, /<header>[\s\S]*class="back-link"[\s\S]*<h1>Basics<\/h1>[\s\S]*<p class="subtitle">Sub<\/p>[\s\S]*<\/header>\s*<div class="card">x<\/div>/);
  assert.ok(!pageHtml.includes('kmwc:title'));

  // A <style> inside a script is a string (shadow-DOM styles, an SVG's own <style>) — it stays put.
  const scriptStyleHtml = composePage(
    '<meta name="kmwc:title" content="X">\n<style>.page{}</style>\n<script>el.innerHTML = `<style>.shadow{}</style><span></span>`;</script>',
    { config, pagePath: '/examples-x.html' }
  );
  assert.match(scriptStyleHtml, /<head>[\s\S]*<style>\.page\{\}<\/style>[\s\S]*<\/head>/);
  assert.match(scriptStyleHtml, /<\/head>[\s\S]*<script>el\.innerHTML = `<style>\.shadow\{\}<\/style><span><\/span>`;<\/script>/);

  const bareHtml = composePage('<meta name="kmwc:layout" content="bare">\n<meta name="kmwc:entry" content="none">\n<p>index</p>', { config, pagePath: '/index.html' });
  assert.ok(!bareHtml.includes('<header>') && !bareHtml.includes('src="/src/index.ts"'));
  assert.throws(() => composePage('<p>no title</p>', { config, pagePath: '/x.html' }), /needs <meta name="kmwc:title"/);

  const fullDocument = '<!DOCTYPE html><html><head></head><body><p>legacy</p></body></html>';
  assert.equal(composePage(fullDocument, { config, pagePath: '/legacy.html' }), fullDocument);
  assert.ok(checkIsFragment('<!-- <html> in a comment --><p>x</p>'));
  // Only a document START counts: `<html>` mentioned in a script or a code sample is still a fragment.
  assert.ok(checkIsFragment('<meta name="kmwc:title" content="X">\n<script>// `dir` on any ancestor / <html> mirrors it</script>'));
  assert.ok(checkIsFragment('<pre><code>&lt;html&gt;</code></pre><template><html></html></template>'));
  assert.ok(!checkIsFragment('﻿<!-- header -->\n<html lang="en"><body></body></html>'));
  assert.ok(!checkIsFragment('  <!doctype html>\n<p>x</p>'));
});

test('composer: every scaffold page (full and --minimal) composes', () => {
  const config = mapKmwcConfig(createPackageJson({ title: 'Web Sample' }), join(DEVKIT_ROOT, 'templates', 'new'));
  const templateVariables = new Proxy({}, { has: () => true, get: (_, name) => (name === 'PREFIX' ? 'ws' : name === 'TAG' ? 'web-sample' : `x-${String(name).toLowerCase()}`) });
  for (const variantDirectory of ['new', 'new-minimal']) {
    const variantRoot = join(DEVKIT_ROOT, 'templates', variantDirectory);
    for (const pageFile of readdirSync(variantRoot).filter((fileName) => fileName.endsWith('.html'))) {
      const pageHtml = renderTemplate(readFileSync(join(variantRoot, pageFile), 'utf8'), templateVariables);
      const readFile = (absolutePath, displayPath) => renderTemplate(readFileSync(join(DEVKIT_ROOT, 'templates', 'new', displayPath), 'utf8'), templateVariables);
      const composedHtml = composePage(pageHtml, { config, pagePath: `/${pageFile}`, readFile });
      assert.match(composedHtml, /^<!DOCTYPE html>/, `${variantDirectory}/${pageFile} did not compose to a document`);
      assert.ok(!/<kmwc-(include|demo)\b/.test(composedHtml.replace(/<!--[\s\S]*?-->/g, '')), `${variantDirectory}/${pageFile} left a kmwc tag`);
    }
  }
});

test('chapter index: headings → code, title, page, link (coded by code, uncoded by slug)', () => {
  assert.equal(getHeadingText('RS01 &middot; Shared <code>--base-*</code> <span class="badge new">New</span>'), 'RS01 · Shared --base-*');
  assert.equal(getHeadingText('Phases &amp; Config&#160;Cell'), 'Phases & Config Cell', 'entities decoded, whitespace collapsed');

  const pageHtml = [
    '<html><head><title>Theming — Web Sample</title><style>h2{}</style></head><body>',
    '<header><h1>Theming</h1></header>',
    '<!-- <h2>XX01 · commented out</h2> -->',
    '<div class="card"><h2>TH07 · Per-instance <code>data-theme</code></h2></div>',
    '<div class="card"><h2>EV4b · Non-standard code</h2></div>',
    '<script>el.innerHTML = "<h2>XX02 · from a script</h2>";</script>',
    '<div class="card"><h2>API summary</h2></div>',
    '<div class="card"><h2>Summary</h2></div><div class="card"><h2>Summary</h2></div>',
    '</body></html>',
  ].join('\n');
  const chapters = getPageChapters(pageHtml, { pageHref: 'examples-theming.html' });
  assert.deepEqual(
    chapters.map((chapter) => [chapter.code, chapter.title, chapter.href]),
    [
      ['TH07', 'Per-instance data-theme', 'examples-theming.html#th07'],
      ['EV4b', 'Non-standard code', 'examples-theming.html#ev4b'],
      [null, 'API summary', 'examples-theming.html#api-summary'],
      [null, 'Summary', 'examples-theming.html#summary'],
      [null, 'Summary', 'examples-theming.html#summary-2'],
    ]
  );
  assert.ok(chapters.every((chapter) => chapter.pageTitle === 'Theming'));

  // The playground: every example page, composed (includes resolved), the landing page left out.
  const config = getPlaygroundConfig();
  const playgroundChapters = generateChapterIndex(config, getExamplePages(config));
  assert.ok(!playgroundChapters.some((chapter) => chapter.pageHref === 'index.html'));
  assert.deepEqual([...new Set(playgroundChapters.map((chapter) => chapter.pageTitle))], ['Basic Usage', 'Devkit kit', 'Form controls', 'Tables', 'Theming', 'Widgets']);
  assert.ok(playgroundChapters.some((chapter) => chapter.code === null && chapter.title === 'Summary'));
});

test('chapter search: code or title contains the query (wcp matchesAny); exact code, then code prefix, then the rest', () => {
  const chapters = [
    { code: 'BU01', title: 'Basic theming setup' },
    { code: 'TH01', title: 'Dark mode signals' },
    { code: 'TH07', title: 'Per-instance data-theme' },
    { code: null, title: 'API summary' },
    { code: 'TH12', title: 'API for themes' },
  ];
  const getLabels = (query) => searchChapters(chapters, query).map((chapter) => chapter.code ?? chapter.title);
  assert.deepEqual(getLabels(''), ['BU01', 'TH01', 'TH07', 'API summary', 'TH12']);
  assert.deepEqual(getLabels('  '), ['BU01', 'TH01', 'TH07', 'API summary', 'TH12'], 'blank = all (wcp: trimmed needle)');
  assert.deepEqual(getLabels('th07'), ['TH07']);
  assert.deepEqual(getLabels('TH7'), ['TH07'], 'zero padding does not matter');
  assert.deepEqual(getLabels('th'), ['TH01', 'TH07', 'TH12', 'BU01'], 'code prefix before text hits');
  assert.deepEqual(getLabels('api'), ['API summary', 'TH12']);
  assert.deepEqual(getLabels('data-theme'), ['TH07'], 'the whole query is one substring');
  assert.deepEqual(getLabels('theme api'), [], 'words are not split (wcp semantics)');

  assert.ok(checkMatchesAny([null, 'Dark mode'], ' MODE '));
  assert.ok(!checkMatchesAny(['Dark mode'], 'light'));
  assert.equal(renderHighlightedText('Per-instance <data>-Theme', 'theme'), 'Per-instance &lt;data&gt;-<mark>Theme</mark>');
  assert.equal(renderHighlightedText('aaaa', 'aa'), '<mark>aa</mark><mark>aa</mark>');
  assert.equal(renderHighlightedText('a & b', ' '), 'a &amp; b');
});

test('spotlight: wcp keyboard map — arrows wrap, page keys step 8 and clamp, Home/End', () => {
  assert.equal(getMovedIndex(4, 5, 'down'), 0);
  assert.equal(getMovedIndex(0, 5, 'up'), 4);
  assert.equal(getMovedIndex(-1, 5, 'up'), 4);
  assert.equal(getMovedIndex(2, 20, 'pageDown'), 10);
  assert.equal(getMovedIndex(15, 20, 'pageDown'), 19);
  assert.equal(getMovedIndex(5, 20, 'pageUp'), 0);
  assert.equal(getMovedIndex(7, 20, 'home'), 0);
  assert.equal(getMovedIndex(7, 20, 'end'), 19);
  assert.equal(getMovedIndex(-1, 0, 'down'), -1, 'empty list: no move');
});

test('spotlight mirror: every mirrored source names an existing target and a known repository', () => {
  const mirrorConfig = JSON.parse(readFileSync(join(DEVKIT_ROOT, 'scripts', 'spotlight-mirror.json'), 'utf8'));
  for (const mirror of mirrorConfig.mirrors) {
    assert.ok(mirror.repository in mirrorConfig.repositories, `${mirror.source}: unknown repository ${mirror.repository}`);
    assert.ok(readFileSync(join(DEVKIT_ROOT, mirror.target), 'utf8').length, `${mirror.target} missing`);
  }
  assert.ok(Object.values(mirrorConfig.repositories).every((repository) => /^[0-9a-f]{40}$/.test(repository.alignedCommit)));
});

test('chapter links: a hash resolves by anchor id, section code or heading slug', () => {
  assert.equal(getChapterCode('TH07 · Title'), 'TH07');
  assert.equal(getChapterCode('Summary'), null);
  assert.equal(mapToCodeKey('TH07'), 'th7');
  assert.equal(mapToCodeKey('TH100'), 'th100');
  const sections = [
    { id: 'dk01', label: 'DK01 · Accent tokens' },
    { id: 'th07-per-instance-data-theme', label: 'TH07 · Per-instance data-theme' },
    { id: 'wrap-up', label: 'Summary' },
  ];
  assert.equal(findSectionByHash('#th07-per-instance-data-theme', sections)?.id, 'th07-per-instance-data-theme');
  assert.equal(findSectionByHash('#th07', sections)?.id, 'th07-per-instance-data-theme');
  assert.equal(findSectionByHash('#TH7', sections)?.id, 'th07-per-instance-data-theme');
  assert.equal(findSectionByHash('#summary', sections)?.id, 'wrap-up', 'uncoded section with its own id');
  assert.equal(findSectionByHash('#nothing', sections), null);
  assert.equal(findSectionByHash('#', sections), null);
});

test('readme: catalogue renders every registry entry', () => {
  const catalogueText = renderCatalogue();
  for (const entry of getRegistry().components) assert.ok(catalogueText.includes(entry.id), `${entry.id} missing from catalogue`);
});

test('cli: argument parser', () => {
  const newFlags = { booleans: ['register'], values: ['title', 'port'] };
  assert.deepEqual(parseArgs(['web-x', '--title', 'X Y', '--register', '--port=13300'], newFlags), {
    _: ['web-x'],
    title: 'X Y',
    register: true,
    port: '13300',
  });
  // A boolean never swallows the next word; --root is global.
  assert.deepEqual(parseArgs(['--register', 'web-x', '--root', '../y'], newFlags), { _: ['web-x'], register: true, root: '../y' });
  assert.throws(() => parseArgs(['--chek'], newFlags), /unknown option "--chek"/);
  assert.throws(() => parseArgs(['-x'], newFlags), /unknown option "-x"/);
  assert.throws(() => parseArgs(['--title'], newFlags), /--title needs a value/);
  assert.throws(() => parseArgs(['--register=yes'], newFlags), /takes no value/);
});

test('cli: <command> --help prints the usage and never runs the command', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kmwc-help-'));
  try {
    writeFileSync(join(temporaryRoot, 'package.json'), JSON.stringify(createPackageJson({ ports: { dev: 14000 } })));
    const runCli = (...cliArgs) => spawnSync(process.execPath, [join(DEVKIT_ROOT, 'src/cli/kmwc.js'), ...cliArgs, '--root', temporaryRoot], { encoding: 'utf8' });
    for (const helpFlag of ['--help', '-h']) {
      const result = runCli('sync', helpFlag);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Usage: kmwc sync/);
    }
    assert.equal(existsSync(join(temporaryRoot, 'Makefile')), false, 'sync --help wrote files');
    const typoResult = runCli('sync', '--chek');
    assert.equal(typoResult.status, 2);
    assert.match(typoResult.stderr, /unknown option "--chek"/);
    assert.equal(existsSync(join(temporaryRoot, 'Makefile')), false, 'sync with an unknown option wrote files');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('config: library: false and cssVariables: false — no library build, no check:vars', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kmwc-library-'));
  try {
    writeFileSync(join(temporaryRoot, 'component-variables.manifest.json'), '{}');
    const defaultConfig = mapKmwcConfig(createPackageJson(), temporaryRoot);
    assert.equal(defaultConfig.library.shouldBuild, true);
    assert.equal(defaultConfig.cssVariables.isEnabled, true);
    assert.equal(getStandardScripts(defaultConfig).build, 'vite build');
    assert.equal(getStandardScripts(defaultConfig)['check:vars'], 'kmwc check-vars');

    const libraryConfig = mapKmwcConfig(createPackageJson({ library: false, cssVariables: false }), temporaryRoot);
    assert.equal(libraryConfig.library.shouldBuild, false);
    assert.equal(libraryConfig.library.entry, 'src/index.ts', 'pages still load the entry');
    assert.equal(libraryConfig.cssVariables.isEnabled, false);
    assert.equal('build' in getStandardScripts(libraryConfig), false);
    assert.equal('check:vars' in getStandardScripts(libraryConfig), false);
    assert.equal(mapKmwcConfig(createPackageJson({ cssVariables: { checkMode: 'off' } }), temporaryRoot).cssVariables.isEnabled, false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('vite: with library: false a plain build refuses to run, the examples build still runs', async () => {
  const { defineComponentConfig } = await import('../src/vite/index.js');
  const getViteConfig = defineComponentConfig({ root: PLAYGROUND_ROOT, library: false });
  await assert.rejects(getViteConfig({ command: 'build', mode: 'production' }), /kmwc\.library is false/);
  const examplesConfig = await getViteConfig({ command: 'build', mode: 'examples' });
  assert.equal(examplesConfig.build.outDir, 'dist-examples');
});

test('doctor: a library runs only the suites that apply to it', () => {
  assert.equal(getRegistryKind('web-components-core'), 'library');
  assert.equal(getRegistryKind('web-multiselect'), 'component');
  assert.equal(getRegistryKind('web-not-registered'), 'component');
  assert.equal(mapKmwcConfig(createPackageJson({ kind: 'library' })).kind, 'library');
  assert.deepEqual(getRulebookSuites('component'), RULEBOOK_SUITES);
  const librarySuiteNames = getRulebookSuites('library').map((suite) => suite.name);
  assert.deepEqual(librarySuiteNames, ['naming-conventions', 'readme-structure', 'publish-command', 'example-pages']);
});

test('doctor: VALIDATION-NOTES.md headings accept check ids; prose mentions do not', () => {
  const notes = '# Validation notes\n\n## C-CST-4 / C-CST-10 — Namespace split\nSee also C-NC-3 in prose.\n\n## C-CSS-1 — Lean strategy\n';
  assert.deepEqual([...getAcceptedCheckIds(notes)].sort(), ['C-CSS-1', 'C-CST-10', 'C-CST-4']);
  assert.equal(getAcceptedCheckIds(null).size, 0);
});

test('doctor: package.json targets must match the library build outputs', () => {
  const library = mapKmwcConfig(createPackageJson({ library: { fileName: 'web-sample' } }), DEVKIT_ROOT).library;
  assert.deepEqual(getLibraryOutputPaths(library), ['dist/web-sample.js', 'dist/web-sample.umd.js', 'dist/style.css', 'dist/index.d.ts']);
  const packageJson = {
    main: './dist/web-sample.umd.js',
    style: './dist/web-sample.css',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/web-sample.js' }, './style.css': './dist/web-sample.css', './dist/*': './dist/*' },
  };
  assert.deepEqual(getLibraryOutputMismatches(packageJson, library).map(({ field }) => field), ['style', 'exports["./style.css"]']);
  assert.deepEqual(getLibraryOutputMismatches(packageJson, { ...library, cssFileName: 'web-sample' }), []);
  // Types from the repo's own tsc step: .d.ts targets aren't checked.
  assert.deepEqual(getLibraryOutputMismatches({ types: './dist/web-sample.d.ts' }, library).map(({ field }) => field), ['types']);
  assert.deepEqual(getLibraryOutputMismatches({ types: './dist/web-sample.d.ts' }, { ...library, shouldEmitTypes: false }), []);
  assert.equal(getLegacyGlobalName("build: { lib: { entry: 'src/index.ts', name: 'WebTreeView', formats: ['es'] } }"), 'WebTreeView');
  assert.equal(getLegacyGlobalName('export default defineComponentConfig();'), null);
});

test('doctor: ports — script flags, mentions, sibling collisions, shared Plausible ids', () => {
  assert.deepEqual(getScriptPortMismatches({ dev: 'vite --port 21111', preview: 'vite preview' }, { dev: 12300, preview: 12301 }), [
    { scriptName: 'dev', port: 21111, expectedPort: 12300 },
  ]);
  assert.deepEqual(getMentionedPorts('npm run dev # port 21111, open http://localhost:12300; IMAGE_PORT ?= 12210; server: { port: 5173 }'), [5173, 12210, 12300, 21111]);
  assert.deepEqual(getPortBlockRange(12300), [12300, 12399]);

  const workspaceRoot = mkdtempSync(join(tmpdir(), 'kmwc-siblings-'));
  try {
    const writeRepo = (id, packageJson, files = {}) => {
      mkdirSync(join(workspaceRoot, id), { recursive: true });
      writeFileSync(join(workspaceRoot, id, 'package.json'), JSON.stringify({ name: `@keenmate/${id}`, ...packageJson }));
      for (const [fileName, text] of Object.entries(files)) writeFileSync(join(workspaceRoot, id, fileName), text);
    };
    writeRepo('web-own', { kmwc: { ports: { dev: 12300, image: 12310 }, analytics: { plausibleSiteId: 'pa-shared' } } }, { 'README.md': 'Dev server on port 21111.' });
    writeRepo('web-other', { scripts: { dev: 'vite' } }, { 'vite.config.ts': 'server: { port: 12300 }', 'plausible-snippet.html': '<script src="https://stats.keenmate.services/js/pa-shared.js"></script>' });
    writeRepo('web-clean', { kmwc: { ports: { dev: 12400, image: 12410 } } });
    const registry = {
      components: [
        { id: 'web-own', port: 12300, path: '../web-own' },
        { id: 'web-other', port: 12200, path: '../web-other' },
        { id: 'web-clean', port: 12400, path: '../web-clean' },
        { id: 'web-components', port: 15900, path: '.' },
      ],
    };
    const config = { id: 'web-own', root: join(workspaceRoot, 'web-own') };
    assert.deepEqual(loadSiblingPortCollisions(config, registry), [{ id: 'web-other', port: 12300, file: 'vite.config.ts' }]);
    assert.deepEqual(loadStalePortMentions(config.root, 12300), [{ file: 'README.md', port: 21111 }]);
    assert.equal(loadPlausibleSiteId(config.root), 'pa-shared');
    assert.deepEqual(loadSharedPlausibleSiteIds(config, registry, 'pa-shared'), ['web-other']);
    assert.deepEqual(loadSharedPlausibleSiteIds(config, registry, null), []);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('doctor: page CSS the kit already covers', () => {
  const kitClassNames = loadKitClassNames();
  assert.ok(kitClassNames.has('pill') && kitClassNames.has('card') && !kitClassNames.has('kmwc-spotlight'));
  const page = `<style>
      .kbd { padding: 2px; }
      .pill { color: red; }
      .my-demo .pill, .tree-container { border: 0; }
      @media (max-width: 600px) { mark { color: blue; } }
    </style>
    <input type="number" style="width:5rem"> <span style="margin-left: auto"></span>
    <div style="margin-top:1rem"></div> <div style="margin-top:1rem; color: red"></div> <input style="width: 90px">`;
  const duplicates = getKitDuplicates(page, kitClassNames);
  assert.deepEqual(duplicates.map(({ found }) => found), [
    '.kbd { … }',
    '.pill { … }',
    'mark { … }',
    '<input style="width:5rem">',
    'style="margin-left: auto"',
    'style="margin-top:1rem"',
    '<input style="width: 90px">',
  ]);
  assert.deepEqual(duplicates.filter(({ found }) => found.startsWith('<input')).map(({ advice }) => advice), ['class="w-xs"', 'class="w-sm"']);
  assert.deepEqual(getKitDuplicates('.tree-container { padding: 1rem; } .card { gap: 0; }', kitClassNames, { isStylesheet: true }).map(({ found }) => found), ['.card { … }']);
});

test('doctor: hard-coded page colours — literals warn, var() fallbacks / light-dark() / fixed-colour blocks pass', () => {
  assert.equal(checkIsHardcodedColor('background', '#fff'), true);
  assert.equal(checkIsHardcodedColor('border', '1px solid rgb(0 0 0 / 0.1)'), true);
  assert.equal(checkIsHardcodedColor('color', 'white'), true);
  assert.equal(checkIsHardcodedColor('color', 'var(--kmwc-text-color, #333)'), false);
  assert.equal(checkIsHardcodedColor('color', 'var(--a, var(--b, #333))'), false);
  assert.equal(checkIsHardcodedColor('color', 'light-dark(#333, #eee)'), false);
  assert.equal(checkIsHardcodedColor('background-color', 'rgb(from var(--wtv-glow) r g b / 0.2)'), false);
  assert.equal(checkIsHardcodedColor('--demo-color', '#f00'), false);
  assert.equal(checkIsHardcodedColor('width', '120px'), false);
  assert.equal(checkIsHardcodedColor('font-family', '"Red Hat Text"'), false);
  const page = `<style>
      /* .old { color: #000; } */
      .search-bar,
      .status-bar { background: #f8fafc; border: 1px solid var(--kmwc-border-color); }
      @media (max-width: 600px) { .hint { color: #64748b; } }
    </style>
    <style data-kmwc-fixed-colors>.neon { background: #000; }</style>
    <span style="color: #fc8181">x</span> <span style="padding: 0">y</span>`;
  assert.deepEqual(getHardcodedColors(page).map(({ found }) => found), [
    '.search-bar, .status-bar { background: #f8fafc }',
    '.hint { color: #64748b }',
    'style="color: #fc8181"',
  ]);
  assert.deepEqual(getHardcodedColors('.swatch { color: #fff; }', { isStylesheet: true }).map(({ found }) => found), ['.swatch { color: #fff }']);
  const markedStylesheet = '/* plain */ .a { color: #111; } /* kmwc-fixed-colors: fixture */ .b { color: #222; } .c { color: #333; }';
  assert.deepEqual(getHardcodedColors(markedStylesheet, { isStylesheet: true }).map(({ found }) => found), ['.a { color: #111 }', '.c { color: #333 }']);
});

test('doctor: the loader class the installed core draws vs the one the CSS styles', () => {
  assert.equal(getCoreLoaderSeparator('span.className = `${prefix}__loader`;'), '__');
  assert.equal(getCoreLoaderSeparator('span.className = `${prefix}-loader`; // `${prefix}-loader-spin`'), '-');
  assert.equal(getCoreLoaderSeparator('a.className=e+"__loader"'), '__');
  assert.equal(getCoreLoaderSeparator('no loader here'), null);
  assert.deepEqual(
    getStyledLoaderClasses('/* .wtv__loader */ .wtv-loader { width: var(--wtv-loader-size); } .wtv__loading-overlay .wtv-loader {} .wtv__loader-overlay {}', 'wtv'),
    [{ className: 'wtv-loader', separator: '-' }]
  );
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'kmwc-loader-'));
  try {
    const coreRoot = join(workspaceRoot, 'node_modules', '@keenmate', 'web-components-core');
    mkdirSync(join(coreRoot, 'dist', 'dom'), { recursive: true });
    writeFileSync(join(coreRoot, 'package.json'), JSON.stringify({ version: '1.0.0-rc19' }));
    writeFileSync(join(coreRoot, 'dist', 'dom', 'render-loader.js'), 'span.className = `${prefix}__loader`;');
    const componentRoot = join(workspaceRoot, 'web-x');
    mkdirSync(join(componentRoot, 'src', 'css'), { recursive: true });
    writeFileSync(join(componentRoot, 'src', 'css', 'loading.css'), '.x-loader { inline-size: 1em; }');
    assert.deepEqual(loadCoreLoader(componentRoot), { version: '1.0.0-rc19', separator: '__' });
    assert.deepEqual(loadStyledLoaderClasses(componentRoot, 'x'), [{ file: 'src/css/loading.css', className: 'x-loader', separator: '-' }]);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('check-pages: widths parse; a report turns into problems', () => {
  assert.deepEqual(parseWidths(undefined), DEFAULT_WIDTHS);
  assert.deepEqual(parseWidths('390, 320'), [390, 320]);
  assert.throws(() => parseWidths('wide'), /pixel widths/);
  const cleanReport = { width: 390, errors: [], undefinedElements: [], scrollWidth: 390, clientWidth: 390, offenders: [] };
  assert.deepEqual(getPageProblems(cleanReport), []);
  assert.deepEqual(
    getPageProblems({ ...cleanReport, errors: ['page error: boom'], undefinedElements: ['web-sample'], scrollWidth: 460, offenders: ['div#phone.ios-phone'] }),
    ['page error: boom', 'never defined: <web-sample>', 'page is 460px wide in a 390px viewport — widest: div#phone.ios-phone']
  );
});

test('check-pages: page rules and the element each one styles (for the shadow-root check)', () => {
  assert.equal(getSelectorSubject('.tree .badge:hover::after'), '.badge');
  assert.equal(getSelectorSubject('.wtv-node > .my-badge'), '.my-badge');
  assert.equal(getSelectorSubject('li:not(.x) .tag[data-a="b c"]'), '.tag[data-a="b c"]');
  assert.equal(getSelectorSubject('#x.y'), '#x.y');
  assert.equal(getSelectorSubject(':root'), null);
  assert.equal(getSelectorSubject('div'), null);
  assert.equal(getSelectorSubject('from'), null);
  const cleanReport = { width: 1440, errors: [], undefinedElements: [], scrollWidth: 1440, clientWidth: 1440, offenders: [] };
  assert.match(getPageProblems({ ...cleanReport, shadowOnlyRules: [{ selector: '.node-badge', host: 'web-treeview' }] })[0], /"\.node-badge" only matches inside <web-treeview>'s shadow root/);
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'kmwc-page-rules-'));
  try {
    writeFileSync(join(workspaceRoot, 'examples-a.html'), '<style>.row .badge { color: red; } :root { --x: 1; } @media (width < 600px) { .badge { gap: 0; } }</style><p>x</p>');
    writeFileSync(join(workspaceRoot, 'examples-local.css'), '.shared:hover { color: red; }');
    assert.deepEqual(loadPageRules(workspaceRoot, join(workspaceRoot, 'examples-a.html')), [
      { selector: '.row .badge', subject: '.badge' },
      { selector: '.badge', subject: '.badge' },
      { selector: '.shared:hover', subject: '.shared' },
    ]);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
