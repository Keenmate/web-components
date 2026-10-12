/**
 * kmwc check-release --tag latest|rc — gate a publish (publish-command.md).
 *
 *   - `latest` takes release versions only (no pre-release suffix);
 *     `rc` takes `-rcN` versions only — a mismatch publishes under the wrong tag.
 *   - The version must not already be on npm (`npm view` — a re-publish fails
 *     late, after the build, and leaves the CHANGELOG lying).
 *   - The topmost CHANGELOG heading should be this version (warning only).
 *
 * Exit 1 on a failed gate. `--offline` skips the npm lookup.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getKmwcConfig } from '../../config.js';

const RC_VERSION_PATTERN = /-rc\d+$/;
const PRE_RELEASE_PATTERN = /-/;

/** Pure version-vs-tag verdict — exported for tests. Returns an error message or null. */
export function checkVersionForTag(version, distTag) {
  if (distTag === 'latest' && PRE_RELEASE_PATTERN.test(version)) {
    return `${version} is a pre-release — publish it with \`make publish-rc\` (dist-tag rc)`;
  }
  if (distTag === 'rc' && !RC_VERSION_PATTERN.test(version)) {
    return `${version} is not an -rcN version — bump to x.y.z-rcN, or publish a release with \`make publish\``;
  }
  if (!['latest', 'rc'].includes(distTag)) return `unknown dist-tag "${distTag}" (expected latest or rc)`;
  return null;
}

function checkIsPublished(packageName, version) {
  const result = spawnSync('npm', ['view', `${packageName}@${version}`, 'version'], { encoding: 'utf8', shell: true });
  return result.status === 0 && result.stdout.trim() === version;
}

function getTopChangelogVersion(root) {
  const changelogPath = join(root, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) return null;
  return readFileSync(changelogPath, 'utf8').match(/^## \[?([^\]\s]+)\]?/m)?.[1] ?? null;
}

export async function run(args) {
  const config = getKmwcConfig(args.root);
  const distTag = args.tag || 'latest';
  const failures = [];

  const versionError = checkVersionForTag(config.version, distTag);
  if (versionError) failures.push(versionError);

  if (!args.offline && checkIsPublished(config.packageName, config.version)) {
    failures.push(`${config.packageName}@${config.version} is already published — bump the version first`);
  }

  const changelogVersion = getTopChangelogVersion(config.root);
  if (changelogVersion !== config.version) {
    console.warn(`⚠ CHANGELOG.md's top entry is ${changelogVersion ?? '(none)'}, not ${config.version}`);
  }

  if (failures.length) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    return 1;
  }
  console.log(`✓ ${config.packageName}@${config.version} can be published under "${distTag}"`);
  return 0;
}
