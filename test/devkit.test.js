// Unit tests for the parts of the devkit that don't need a browser.
// (The examples kit is covered end-to-end by playground/e2e — `npm run test:e2e`.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapKmwcConfig, getRegistry, DEVKIT_ROOT } from '../src/config.js';
import {
  getSyncPlan,
  renderTemplate,
  getTemplateVariables,
  updateClaudeBlock,
  CLAUDE_BLOCK_START,
  CLAUDE_BLOCK_END,
  GENERATED_MARK,
} from '../src/cli/sync-plan.js';
import { checkManifestVariables } from '../src/cli/commands/check-vars.js';
import { checkVersionForTag } from '../src/cli/commands/check-release.js';
import { getSuiteFailures, RULEBOOK_SUITES } from '../src/cli/commands/doctor.js';
import { checkPrefix, generatePrefix, getReservedPrefixes } from '../src/cli/commands/new.js';
import { renderCatalogue } from '../src/cli/commands/readme.js';
import { createExamplesPlugin } from '../src/vite/index.js';
import { parseArgs } from '../src/cli/args.js';
import { CHAPTER_NAV_CLASSES, COPY_LINK_CLASSES, DEMO_CLASSES, INDEX_PAGE_CLASSES, THEME_SWITCH_CLASSES } from '../src/examples/constants.js';
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

test('registry: ids, prefixes and port blocks are unique', () => {
  const { components } = getRegistry();
  const ids = components.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');

  const prefixes = components.map((entry) => entry.prefix).filter(Boolean);
  assert.equal(new Set(prefixes).size, prefixes.length, 'duplicate prefix');

  const portOwners = new Map();
  for (const entry of components.filter((candidate) => candidate.ports)) {
    // dev, preview (dev + 1) and image ports must never collide across repos.
    const ports = [entry.ports.dev, entry.ports.dev != null ? entry.ports.dev + 1 : null, entry.ports.image].filter((port) => port != null);
    for (const port of ports) {
      assert.ok(!portOwners.has(port), `port ${port} used by both ${portOwners.get(port)} and ${entry.id}`);
      portOwners.set(port, entry.id);
    }
  }
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

test('check-vars: declared vs consumed modes, internals, comments ignored', () => {
  const cssText = `
    /* --ms-ghost: 1px; var(--base-ghost) */
    :host { --ms-gap: 4px; --ms-internal-width: 0; color: var(--base-text-color, red); }
    .x { padding: var(--ms-pad, 2px); }`;
  const manifest = {
    baseVariables: [{ name: 'base-text-color' }, { name: 'base-dead' }],
    componentVariables: [{ name: 'ms-gap' }, { name: 'ms-gone' }],
  };
  const declaredVerdict = checkManifestVariables({ cssText, manifest, prefix: 'ms', internalVariables: ['ms-internal-width'] });
  assert.deepEqual(declaredVerdict.unusedBaseVariables, ['base-dead']);
  assert.deepEqual(declaredVerdict.missingBaseVariables, []);
  assert.deepEqual(declaredVerdict.unusedComponentVariables, ['ms-gone']);
  assert.deepEqual(declaredVerdict.undocumentedComponentVariables, []);

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
});

test('kit: every generated class is kmwc-prefixed BEM', () => {
  const kitClassNames = [CHAPTER_NAV_CLASSES, COPY_LINK_CLASSES, DEMO_CLASSES, INDEX_PAGE_CLASSES, THEME_SWITCH_CLASSES].flatMap((classes) => Object.values(classes));
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

const createPartialReader = (partials) => (absolutePath, displayPath) => {
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

  const bareHtml = composePage('<meta name="kmwc:layout" content="bare">\n<meta name="kmwc:entry" content="none">\n<p>index</p>', { config, pagePath: '/index.html' });
  assert.ok(!bareHtml.includes('<header>') && !bareHtml.includes('src="/src/index.ts"'));
  assert.throws(() => composePage('<p>no title</p>', { config, pagePath: '/x.html' }), /needs <meta name="kmwc:title"/);

  const fullDocument = '<!DOCTYPE html><html><head></head><body><p>legacy</p></body></html>';
  assert.equal(composePage(fullDocument, { config, pagePath: '/legacy.html' }), fullDocument);
  assert.ok(checkIsFragment('<!-- <html> in a comment --><p>x</p>'));
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

test('readme: catalogue renders every registry entry', () => {
  const catalogueText = renderCatalogue();
  for (const entry of getRegistry().components) assert.ok(catalogueText.includes(entry.id), `${entry.id} missing from catalogue`);
});

test('cli: argument parser', () => {
  assert.deepEqual(parseArgs(['web-x', '--title', 'X Y', '--register', '--port=13300']), {
    _: ['web-x'],
    title: 'X Y',
    register: true,
    port: '13300',
  });
});
