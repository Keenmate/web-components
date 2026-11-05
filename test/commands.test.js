/**
 * The CLI commands that write files or gate a publish, end to end on temp repos:
 *   - `kmwc new` scaffolds a repo doctor finds clean (full and --minimal), and its intake refuses
 *     what it must refuse;
 *   - `kmwc sync` rewrites only what it owns, never a local file or an existing script, and
 *     `--check` reports drift without touching anything;
 *   - `kmwc check-release` stops an rc from going out as `latest` (and the reverse).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getKmwcConfig } from '../src/config.js';
import { checkComponent } from '../src/cli/commands/doctor.js';
import { run as runNew } from '../src/cli/commands/new.js';
import { run as runSync } from '../src/cli/commands/sync.js';
import { run as runCheckRelease } from '../src/cli/commands/check-release.js';

/** Run a command with console output captured → { exitCode, output }. */
async function runQuietly(command) {
  const lines = [];
  const { log, warn, error } = console;
  console.log = console.warn = console.error = (...parts) => lines.push(parts.join(' '));
  try {
    return { exitCode: await command(), output: lines.join('\n') };
  } finally {
    Object.assign(console, { log, warn, error });
  }
}

async function withWorkspace(callback) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'kmwc-commands-'));
  try {
    return await callback(workspaceRoot);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

const getLines = (results, level) => results.filter((result) => result.level === level).map((result) => `[${result.checkName}] ${result.message}`);

// ── kmwc new ─────────────────────────────────────────────────────────────────

for (const isMinimal of [false, true]) {
  test(`new${isMinimal ? ' --minimal' : ''}: the scaffold passes doctor — only "not registered yet" is left`, { timeout: 120_000 }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const root = join(workspaceRoot, 'web-zz-fixture');
      const { exitCode, output } = await runQuietly(() => runNew({ _: ['web-zz-fixture'], prefix: 'zqx', dir: root, offline: true, minimal: isMinimal }));
      assert.equal(exitCode, 0, output);
      assert.match(output, /✓ scaffolded web-zz-fixture.* in .*\(prefix zqx, dev port \d+\)/);

      const config = getKmwcConfig(root);
      const results = checkComponent(config, { shouldRunRulebook: false, shouldCheckPackage: true });
      assert.deepEqual(getLines(results, 'error'), []);
      assert.deepEqual(getLines(results, 'warning'), ['[registry] "web-zz-fixture" is not in the devkit components.json']);
      // The checks that matter for a new repo actually ran.
      for (const checkName of ['vite', 'pages', 'sync', 'vars', 'package']) {
        assert.ok(results.some((result) => result.level === 'pass' && result.checkName === checkName), `a pass for ${checkName}`);
      }
      const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      assert.deepEqual([packageJson.kmwc.prefix, packageJson.main, packageJson.kmwc.library.globalName], ['zqx', './dist/web-zz-fixture.umd.js', 'WebZzFixture']);
      assert.ok(packageJson.files.includes('!**/CLAUDE.md') && packageJson.files.includes('!**/.claude'));
    });
  });
}

test('new: the intake refuses a taken name, prefix or port block, a bad prefix, and a non-empty directory', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const runInto = (args) => runQuietly(() => runNew({ offline: true, dir: join(workspaceRoot, 'out'), ...args }));
    await assert.rejects(runInto({ _: ['web-multiselect'], prefix: 'zqx' }), /already in components\.json \(migrating it\? add --adopt\)/);
    await assert.rejects(runInto({ _: ['web-zz-fixture'], adopt: true }), /--adopt: "web-zz-fixture" is not in components\.json/);
    await assert.rejects(runInto({ _: ['web-zz-fixture'], prefix: 'ms' }), /prefix "ms" is already reserved/);
    await assert.rejects(runInto({ _: ['web-zz-fixture'], prefix: 'Z1' }), /must be 2–4 lowercase letters/);
    await assert.rejects(runInto({ _: ['web-zz-fixture'], prefix: 'zqx', port: 12100 }), /port block 12100 belongs to web-multiselect/);
    await assert.rejects(runInto({ _: ['web-zz-fixture'], prefix: 'zqx', port: 12150 }), /is not a port block/);
    await assert.rejects(runInto({ _: ['web-colorpicker'] }), /cannot derive a CSS prefix for "web-colorpicker"/);
    mkdirSync(join(workspaceRoot, 'out'));
    writeFileSync(join(workspaceRoot, 'out', 'keep.txt'), 'mine');
    await assert.rejects(runInto({ _: ['web-zz-fixture'], prefix: 'zqx' }), /exists and is not empty/);
    assert.equal(readFileSync(join(workspaceRoot, 'out', 'keep.txt'), 'utf8'), 'mine');
  });
});

// ── kmwc sync ────────────────────────────────────────────────────────────────

test('sync: rewrites what it owns, keeps local files and existing scripts; --check only reports', { timeout: 120_000 }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const root = join(workspaceRoot, 'web-zz-fixture');
    await runQuietly(() => runNew({ _: ['web-zz-fixture'], prefix: 'zqx', dir: root, offline: true }));
    const readText = (path) => readFileSync(join(root, path), 'utf8');
    const syncedMakefile = readText('Makefile');
    const syncedClaudeMd = readText('CLAUDE.md');

    // Drift: an edited generated file, a local Makefile, a team note outside the CLAUDE.md
    // block, a customised script and a missing one.
    writeFileSync(join(root, 'Makefile'), 'edited by hand\n');
    writeFileSync(join(root, 'Makefile.local'), 'my-target:\n\techo local\n');
    writeFileSync(join(root, 'CLAUDE.md'), syncedClaudeMd.replace('# CLAUDE.md', '# CLAUDE.md\n\nTeam note: keep this.'));
    const packageJson = JSON.parse(readText('package.json'));
    packageJson.scripts.dev = 'vite --open';
    delete packageJson.scripts['check:pages'];
    writeFileSync(join(root, 'package.json'), JSON.stringify(packageJson, null, 4) + '\n');

    const checkRun = await runQuietly(() => runSync({ root, check: true }));
    assert.equal(checkRun.exitCode, 1);
    assert.match(checkRun.output, /✗ would update Makefile/);
    assert.match(checkRun.output, /✗ would add scripts: check:pages/);
    assert.equal(readText('Makefile'), 'edited by hand\n', '--check writes nothing');

    const syncRun = await runQuietly(() => runSync({ root }));
    assert.equal(syncRun.exitCode, 0);
    assert.equal(readText('Makefile'), syncedMakefile);
    assert.equal(readText('Makefile.local'), 'my-target:\n\techo local\n');
    assert.match(readText('CLAUDE.md'), /Team note: keep this\./);
    const syncedPackageText = readText('package.json');
    const syncedPackageJson = JSON.parse(syncedPackageText);
    assert.equal(syncedPackageJson.scripts.dev, 'vite --open', 'an existing script is never rewritten');
    assert.ok(syncedPackageJson.scripts['check:pages']);
    assert.match(syncedPackageText, /^ {4}"name"/m, "package.json keeps the repo's indentation");
    assert.match(syncRun.output, /⚠ script "dev" is "vite --open" — standard is "vite" \(left as is\)/);

    const secondRun = await runQuietly(() => runSync({ root, check: true }));
    assert.equal(secondRun.exitCode, 0);
    assert.match(secondRun.output, /✓ everything in sync/);
    // A generated file that's gone is created again.
    rmSync(join(root, 'Dockerfile'));
    assert.match((await runQuietly(() => runSync({ root }))).output, /✓ create Dockerfile/);
    assert.ok(existsSync(join(root, 'Dockerfile')));
  });
});

test('sync: a package.json without a kmwc section is refused', async () => {
  await withWorkspace(async (root) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@keenmate/web-zz-fixture' }));
    const { exitCode, output } = await runQuietly(() => runSync({ root }));
    assert.equal(exitCode, 1);
    assert.match(output, /package\.json has no "kmwc" section/);
    assert.ok(!existsSync(join(root, 'Makefile')));
  });
});

// ── kmwc check-release ──────────────────────────────────────────────────────

test('check-release: the dist-tag must fit the version; a stale CHANGELOG warns', async () => {
  await withWorkspace(async (root) => {
    const writeRepo = (version, changelogVersion) => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@keenmate/web-zz-fixture', version }));
      writeFileSync(join(root, 'CHANGELOG.md'), `# Changelog\n\n## [${changelogVersion}] - 2026-11-05\n`);
    };
    const checkRelease = (tag) => runQuietly(() => runCheckRelease({ root, tag, offline: true }));

    writeRepo('1.2.0-rc03', '1.2.0-rc03');
    let release = await checkRelease('latest');
    assert.equal(release.exitCode, 1);
    assert.match(release.output, /✗ 1\.2\.0-rc03 is a pre-release — publish it with `make publish-rc`/);
    release = await checkRelease('rc');
    assert.equal(release.exitCode, 0);
    assert.match(release.output, /✓ @keenmate\/web-zz-fixture@1\.2\.0-rc03 can be published under "rc"/);
    assert.doesNotMatch(release.output, /CHANGELOG/);

    writeRepo('1.2.0', '1.2.0-rc03');
    release = await checkRelease('rc');
    assert.equal(release.exitCode, 1);
    assert.match(release.output, /✗ 1\.2\.0 is not an -rcN version/);
    release = await checkRelease(undefined);
    assert.equal(release.exitCode, 0, 'no --tag means latest');
    assert.match(release.output, /⚠ CHANGELOG\.md's top entry is 1\.2\.0-rc03, not 1\.2\.0/);
    assert.equal((await checkRelease('beta')).exitCode, 1);
  });
});
