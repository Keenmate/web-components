/**
 * kmwc check-vars — validate component-variables.manifest.json against the CSS.
 *
 * The manifest feeds the IDE-autocomplete outputs (vscode.css-custom-data.json,
 * web-types.json) and theme-designer, but is hand-maintained — so it drifts
 * from the CSS. This makes drift a build failure. (Replaces the three diverged
 * per-repo copies of scripts/check-variable-manifest.mjs.)
 *
 * Contract (prefix = kmwc.prefix or manifest.prefix, e.g. `ms`):
 *   - every `--base-*` read via var() must be in baseVariables, and vice versa
 *   - checkMode "declared" (default): every `--<prefix>-*` DECLARED (`--x:`)
 *     must be in componentVariables, and vice versa
 *   - checkMode "consumed": the same, but against `var(--<prefix>-*)` reads (for
 *     components whose public knobs are read-with-fallback, never declared)
 *   - names in kmwc.cssVariables.internalVariables are runtime internals — exempt
 *
 * Undocumented component variables are a warning unless --strict; everything else errors.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { getKmwcConfig } from '../../config.js';

const STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.pcss']);

/**
 * Directories are scanned for stylesheets; a file listed explicitly is read
 * whatever its type — e.g. a built bundle that inlines the compiled CSS, for
 * components whose SCSS generates variable names via interpolation.
 */
function getStylesheetTexts(sourcePath, stylesheetTexts, isExplicit = true) {
  if (!existsSync(sourcePath)) throw new Error(`cssVariables source not found: ${sourcePath}`);
  if (statSync(sourcePath).isDirectory()) {
    for (const entryName of readdirSync(sourcePath)) getStylesheetTexts(join(sourcePath, entryName), stylesheetTexts, false);
  } else if (isExplicit || STYLESHEET_EXTENSIONS.has(extname(sourcePath))) {
    stylesheetTexts.push(readFileSync(sourcePath, 'utf8'));
  }
  return stylesheetTexts;
}

const mapToRegExpSource = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pure verdict — exported for tests. */
export function checkManifestVariables({ cssText, manifest, prefix, internalVariables = [], checkMode = 'declared' }) {
  cssText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const prefixSource = mapToRegExpSource(prefix);
  // A declaration is followed by a colon; a var() read by `)` or `,`.
  const declaredVariables = new Set([...cssText.matchAll(new RegExp(`--(${prefixSource}-[a-z0-9-]+)\\s*:`, 'gi'))].map((match) => match[1]));
  const consumedVariables = new Set([...cssText.matchAll(new RegExp(`var\\(\\s*--(${prefixSource}-[a-z0-9-]+)`, 'gi'))].map((match) => match[1]));
  const consumedBaseVariables = new Set([...cssText.matchAll(/var\(\s*--(base-[a-z0-9-]+)/gi)].map((match) => match[1]));

  const componentVariablesInCss = checkMode === 'consumed' ? consumedVariables : declaredVariables;
  const internalVariableSet = new Set(internalVariables);
  const manifestComponentVariables = new Set((manifest.componentVariables || []).map((entry) => entry.name));
  const manifestBaseVariables = new Set((manifest.baseVariables || []).map((entry) => entry.name));
  const getDifference = (left, right) => [...left].filter((name) => !right.has(name)).sort();

  return {
    missingBaseVariables: getDifference(consumedBaseVariables, manifestBaseVariables),
    unusedBaseVariables: getDifference(manifestBaseVariables, consumedBaseVariables),
    unusedComponentVariables: getDifference(manifestComponentVariables, componentVariablesInCss),
    undocumentedComponentVariables: getDifference(componentVariablesInCss, manifestComponentVariables).filter(
      (name) => !internalVariableSet.has(name)
    ),
    counts: { base: manifestBaseVariables.size, component: manifestComponentVariables.size },
  };
}

export async function run(args) {
  const config = getKmwcConfig(args.root);
  const isStrict = !!args.strict;
  const manifestPath = resolve(config.root, config.cssVariables.manifest);
  if (!existsSync(manifestPath)) {
    console.log(`kmwc check-vars: no ${config.cssVariables.manifest} — nothing to check.`);
    return 0;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const prefix = config.prefix || manifest.prefix;
  if (!prefix) throw new Error('no variable prefix — set kmwc.prefix or "prefix" in the manifest');

  const cssText = config.cssVariables.sources.flatMap((sourcePath) => getStylesheetTexts(resolve(config.root, sourcePath), [])).join('\n');
  const verdict = checkManifestVariables({
    cssText,
    manifest,
    prefix,
    internalVariables: config.cssVariables.internalVariables,
    checkMode: config.cssVariables.checkMode,
  });

  const presenceWord = config.cssVariables.checkMode === 'consumed' ? 'consumed via var()' : 'declared';
  const renderSection = (title, names) => `${title} (${names.length}):\n` + names.map((name) => `  --${name}`).join('\n');
  const errors = [];
  const warnings = [];
  if (verdict.missingBaseVariables.length) errors.push(renderSection('--base-* consumed in CSS but MISSING from manifest.baseVariables', verdict.missingBaseVariables));
  if (verdict.unusedBaseVariables.length) errors.push(renderSection('--base-* in manifest.baseVariables but NOT consumed in CSS (dead)', verdict.unusedBaseVariables));
  if (verdict.unusedComponentVariables.length) {
    errors.push(renderSection(`--${prefix}-* in manifest.componentVariables but NOT ${presenceWord} in CSS (dead)`, verdict.unusedComponentVariables));
  }
  if (verdict.undocumentedComponentVariables.length) {
    const section = renderSection(`--${prefix}-* ${presenceWord} in CSS but MISSING from manifest.componentVariables`, verdict.undocumentedComponentVariables);
    if (isStrict) errors.push(section);
    else warnings.push(section + '\n  (warning — --strict enforces; list true internals in kmwc.cssVariables.internalVariables)');
  }

  if (warnings.length) console.warn('\n⚠ variable-manifest warnings:\n\n' + warnings.join('\n\n') + '\n');
  if (errors.length) {
    console.error('\n✗ variable manifest out of sync with CSS:\n\n' + errors.join('\n\n'));
    console.error(`\nEdit ${config.cssVariables.manifest} (source of truth for IDE autocomplete + theme-designer), then rebuild.\n`);
    return 1;
  }
  console.log(
    `✓ variable manifest in sync — ${verdict.counts.base} base, ${verdict.counts.component} component vars` +
      (warnings.length ? ` (${verdict.undocumentedComponentVariables.length} undocumented --${prefix}-* — see warning)` : '') +
      '.'
  );
  return 0;
}
