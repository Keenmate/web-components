#!/usr/bin/env node
/**
 * Has anything the spotlight mirrors changed upstream? For every source file in
 * scripts/spotlight-mirror.json, list the commits in the sibling checkout since
 * the recorded alignedCommit (plus uncommitted edits). Read-only.
 *
 *   npm run check:spotlight-mirror            report; exit 1 when something changed
 *   npm run check:spotlight-mirror -- --diff  include the diffs to port
 *
 * A sibling that isn't checked out is skipped with a note (exit 0) — the check
 * is a maintainer aid, not a gate.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { DEVKIT_ROOT } from '../src/config.js';

const MIRROR_FILE_PATH = resolve(DEVKIT_ROOT, 'scripts', 'spotlight-mirror.json');
const shouldShowDiff = process.argv.includes('--diff');

function runGit(repositoryPath, args) {
  return execFileSync('git', ['-C', repositoryPath, ...args], { encoding: 'utf8' }).trim();
}

const mirrorConfig = JSON.parse(readFileSync(MIRROR_FILE_PATH, 'utf8'));
let hasChanges = false;

for (const [repositoryName, repository] of Object.entries(mirrorConfig.repositories)) {
  const repositoryPath = resolve(DEVKIT_ROOT, repository.path);
  if (!existsSync(resolve(repositoryPath, '.git'))) {
    console.log(`- ${repositoryName}: not checked out at ${repository.path} — skipped`);
    continue;
  }
  const headCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
  const sourcePaths = [...new Set(mirrorConfig.mirrors.filter((mirror) => mirror.repository === repositoryName).map((mirror) => mirror.source))];
  const commitLog = runGit(repositoryPath, ['log', '--oneline', `${repository.alignedCommit}..HEAD`, '--', ...sourcePaths]);
  const uncommittedFiles = runGit(repositoryPath, ['status', '--short', '--', ...sourcePaths]);

  if (!commitLog && !uncommittedFiles) {
    console.log(`✓ ${repositoryName}: mirrored files unchanged since ${repository.alignedCommit.slice(0, 7)}${headCommit === repository.alignedCommit ? '' : ` (HEAD ${headCommit.slice(0, 7)})`}`);
    continue;
  }
  hasChanges = true;
  console.log(`✗ ${repositoryName}: mirrored files changed since ${repository.alignedCommit.slice(0, 7)} (HEAD ${headCommit.slice(0, 7)})`);
  if (commitLog) console.log(commitLog.replace(/^/gm, '    '));
  if (uncommittedFiles) console.log(`  uncommitted:\n${uncommittedFiles.replace(/^/gm, '    ')}`);
  for (const sourcePath of sourcePaths) {
    const changedPaths = runGit(repositoryPath, ['diff', '--name-only', repository.alignedCommit, '--', sourcePath]);
    if (!changedPaths) continue;
    const targets = mirrorConfig.mirrors.filter((mirror) => mirror.repository === repositoryName && mirror.source === sourcePath);
    for (const target of targets) console.log(`  ${sourcePath} [${target.parts.join(', ')}] → ${target.target}`);
    if (shouldShowDiff) console.log(runGit(repositoryPath, ['diff', repository.alignedCommit, '--', sourcePath]).replace(/^/gm, '    '));
  }
}

if (hasChanges) {
  console.log(`\nPort what applies, then set alignedCommit in scripts/spotlight-mirror.json to the sibling's HEAD.`);
  process.exitCode = 1;
}
