/**
 * kmwc sync — bring devkit-owned files in line with package.json#kmwc.
 * Generated files are overwritten wholesale; CLAUDE.md only inside its managed
 * block; .gitignore and package.json scripts only gain what's missing (an
 * existing script is never rewritten — doctor reports the differences).
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getKmwcConfig } from '../../config.js';
import { getSyncPlan, getScriptsPlan } from '../sync-plan.js';

export async function run(args) {
  const config = getKmwcConfig(args.root);
  const isCheckOnly = !!args.check;
  if (!config.hasPackageConfig) {
    console.error('kmwc sync: package.json has no "kmwc" section — add one first (see the devkit README).');
    return 1;
  }

  const changedItems = getSyncPlan(config).filter((planItem) => planItem.isChanged);
  const { missingScripts, differingScripts } = getScriptsPlan(config);
  const missingScriptNames = Object.keys(missingScripts);

  for (const planItem of changedItems) {
    const action = planItem.currentText == null ? 'create' : 'update';
    console.log(`${isCheckOnly ? '✗ would' : '✓'} ${action} ${planItem.path}`);
    if (!isCheckOnly) writeFileSync(join(config.root, planItem.path), planItem.expectedText);
  }

  if (missingScriptNames.length) {
    console.log(`${isCheckOnly ? '✗ would add' : '✓ added'} scripts: ${missingScriptNames.join(', ')}`);
    if (!isCheckOnly) {
      const packageJsonPath = join(config.root, 'package.json');
      const packageJsonText = readFileSync(packageJsonPath, 'utf8');
      const indentation = packageJsonText.match(/^[ \t]+(?=")/m)?.[0] || '  ';
      const packageJson = JSON.parse(packageJsonText);
      packageJson.scripts = { ...(packageJson.scripts || {}), ...missingScripts };
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, indentation) + '\n');
    }
  }

  for (const [scriptName, difference] of Object.entries(differingScripts)) {
    console.log(`⚠ script "${scriptName}" is "${difference.currentCommand}" — standard is "${difference.standardCommand}" (left as is)`);
  }

  if (!changedItems.length && !missingScriptNames.length) console.log('✓ everything in sync');
  return isCheckOnly && (changedItems.length || missingScriptNames.length) ? 1 : 0;
}
