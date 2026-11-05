/**
 * The published bundle: a REAL library build of the playground through the preset. What
 * consumers import — `dist/<fileName>.js` / `.umd.js`, the UMD global, `dist/style.css`,
 * `dist/index.d.ts` — must be what the preset says it emits (getLibraryOutputPaths, the
 * list doctor checks package.json against) and what package.json points at. A preset
 * change that renames an output would otherwise only show up in a consumer's build.
 *
 * Builds in place, into the playground's own (gitignored) dist/ — the way `npm run build`
 * does. Not into a temp --outDir: vite-plugin-dts writes the type entry to package.json's
 * `types` path whatever outDir says, so a temp dir would test a split nobody ships.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getKmwcConfig } from '../src/config.js';
import { getLibraryOutputPaths, getLibraryOutputMismatches } from '../src/cli/repo-checks.js';

const PLAYGROUND_ROOT = fileURLToPath(new URL('../playground', import.meta.url));

/** Names a bundle's trailing `export { a as b, c }` makes public. */
function getBundleExportNames(bundleText) {
  const exportBlocks = [...bundleText.matchAll(/export\s*\{([^}]*)\}/g)].map((match) => match[1]);
  return exportBlocks.flatMap((block) => block.split(',').map((part) => part.trim().split(/\s+as\s+/).pop()).filter(Boolean));
}

/** Runtime names a .d.ts declares (types and interfaces excluded — they don't exist at runtime). */
function getDeclaredRuntimeNames(declarationText) {
  const names = [...declarationText.matchAll(/export\s+declare\s+(?:const|let|function|class|abstract class|enum)\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
  for (const [, block] of declarationText.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const part of block.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
      if (name && !part.trim().startsWith('type ')) names.push(name);
    }
  }
  return [...new Set(names)];
}

test('build: the preset emits exactly the files package.json and doctor expect, with the UMD global and every declared export', { timeout: 180_000 }, () => {
  const outDir = join(PLAYGROUND_ROOT, 'dist');
  const buildRun = spawnSync('npx', ['vite', 'build'], {
    cwd: PLAYGROUND_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(buildRun.status, 0, `vite build failed:\n${buildRun.stdout}\n${buildRun.stderr}`);

  const config = getKmwcConfig(PLAYGROUND_ROOT);
  const emittedFiles = readdirSync(outDir).sort();
  const expectedFiles = getLibraryOutputPaths(config.library).map((path) => path.replace(/^dist\//, '')).sort();
  // What doctor promises is what the build writes — no more, no fewer (source maps aside).
  assert.deepEqual(emittedFiles.filter((file) => !file.endsWith('.map')), expectedFiles);
  // …and package.json points only at those files.
  assert.deepEqual(getLibraryOutputMismatches(config.packageJson, config.library), []);

  // Script-tag users: the UMD assigns the configured global.
  const umdText = readFileSync(join(outDir, `${config.library.fileName}.umd.js`), 'utf8');
  assert.match(umdText, new RegExp(`\\.${config.library.globalName}\\s*=\\s*\\{\\}`), `UMD global ${config.library.globalName}`);

  // Every runtime export the published types declare exists in the ES bundle.
  const bundleExports = getBundleExportNames(readFileSync(join(outDir, `${config.library.fileName}.js`), 'utf8'));
  const declaredExports = getDeclaredRuntimeNames(readFileSync(join(outDir, 'index.d.ts'), 'utf8'));
  assert.ok(declaredExports.length > 0, 'index.d.ts declares runtime exports');
  assert.deepEqual(declaredExports.filter((name) => !bundleExports.includes(name)), [], 'declared but missing from the ES bundle');

  // The stylesheet is real CSS with the component's own rules.
  assert.match(readFileSync(join(outDir, `${config.library.cssFileName}.css`), 'utf8'), new RegExp(`\\.${config.prefix}`));
});
