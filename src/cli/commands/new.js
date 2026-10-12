/**
 * kmwc new <name> — scaffold a component repo in the rulebook shape.
 *
 *   kmwc new web-colorpicker --prefix cpk [--title "Web Color Picker"] [--tag web-colorpicker]
 *        [--dir ../web-colorpicker] [--port 13200] [--minimal] [--register] [--offline]
 *
 * Default: a small working sample (a toggle with `label` / `active` inputs and
 * a `change` event) to rename or replace. `--minimal`: an empty skeleton — no
 * inputs, no events, a slotted root, stub feature CSS — with the same
 * structure and the same passing rulebook checks.
 *
 * Runs the intake (component-intake.md): the npm name must be free, and the
 * CSS prefix must be 2–4 lowercase letters not reserved in the rulebook's
 * base-variables.md table or in components.json. A prefix is derived only for
 * hyphen-separated names (initials) or short single words (tech letter + first
 * letter); anything ambiguous needs --prefix, because word count is a meaning
 * question ("daterangepicker" is three words) a script can't answer.
 *
 * Produces Element / Logic / Side-layer sources, the canonical CSS set, a
 * Custom Elements Manifest config, README + docs/, CHANGELOG, LICENSE,
 * `.claude/commands/publish.md`, examples, fixtures + e2e specs, then the
 * `kmwc sync` files. The port block (dev = block, image = +10) is the next free
 * one in the component range (see PORT_RANGES in config.js; `--port` overrides).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_RULEBOOK_PATH,
  DEVKIT_ROOT,
  getDevkitPackageJson,
  getJsonFile,
  getNextPortBlock,
  getPortsForBlock,
  getRegistry,
  PORT_BLOCK_SIZE,
  PACKAGE_FILES_EXCLUSIONS,
  getUnscopedName,
  mapToPascalCase,
} from '../../config.js';
import { renderTemplate } from '../sync-plan.js';
import { run as runSync } from './sync.js';

const SCAFFOLD_ROOT = join(DEVKIT_ROOT, 'templates', 'new');
/** --minimal: rendered over the full scaffold, replacing only the files that differ. */
const MINIMAL_OVERLAY_ROOT = join(DEVKIT_ROOT, 'templates', 'new-minimal');
const PREFIX_PATTERN = /^[a-z]{2,4}$/;
/** Prefixes used outside component CSS that must not be taken either. */
const INFRASTRUCTURE_PREFIXES = ['kmwc', 'base'];
const SHORT_SINGLE_WORD_LENGTH = 6;
/** Template file names → generated names. */
const FILE_NAME_PLACEHOLDERS = { _gitignore: '.gitignore' };

/** Prefixes reserved in the rulebook (base-variables.md "Existing prefixes" table) — empty when not checked out. */
export function getRulebookPrefixes(rulebookPath = DEFAULT_RULEBOOK_PATH) {
  const baseVariablesPath = join(rulebookPath, 'base-variables.md');
  if (!existsSync(baseVariablesPath)) return [];
  const tableRows = readFileSync(baseVariablesPath, 'utf8').matchAll(/^\|\s*`@keenmate\/[^`]+`\s*\|\s*`([a-z]+)`\s*\|/gm);
  return [...new Set([...tableRows].map((match) => match[1]))];
}

export function getReservedPrefixes(registry = getRegistry(), rulebookPath = DEFAULT_RULEBOOK_PATH) {
  const registryPrefixes = registry.components.map((entry) => entry.prefix).filter(Boolean);
  return new Set([...getRulebookPrefixes(rulebookPath), ...registryPrefixes, ...INFRASTRUCTURE_PREFIXES]);
}

/**
 * component-intake.md "C — CSS prefix derivation", for the cases a script can
 * decide. Returns null when the word count is ambiguous (the caller asks for --prefix).
 */
export function generatePrefix(componentId) {
  const nameWords = componentId.replace(/^(web|svelte)-/, '').split('-').filter(Boolean);
  const techLetter = componentId.startsWith('svelte-') ? 's' : 'w';
  if (nameWords.length > 1) return nameWords.map((word) => word[0]).join('');
  if (nameWords[0].length <= SHORT_SINGLE_WORD_LENGTH) return techLetter + nameWords[0][0];
  return null;
}

/** Error message for an unusable prefix, or null. */
export function checkPrefix(prefix, reservedPrefixes) {
  if (!PREFIX_PATTERN.test(prefix)) return `prefix "${prefix}" must be 2–4 lowercase letters (component-intake.md)`;
  if (reservedPrefixes.has(prefix)) return `prefix "${prefix}" is already reserved — pick another (base-variables.md "Existing prefixes")`;
  return null;
}

function checkIsPackageNameTaken(packageName) {
  const result = spawnSync('npm', ['view', packageName, 'name'], { encoding: 'utf8', shell: true });
  return result.status === 0 && result.stdout.trim() === packageName;
}

function getFilesRecursive(directoryPath, filePaths = []) {
  for (const entryName of readdirSync(directoryPath)) {
    const entryPath = join(directoryPath, entryName);
    if (statSync(entryPath).isDirectory()) getFilesRecursive(entryPath, filePaths);
    else filePaths.push(entryPath);
  }
  return filePaths;
}

/** Render every template under `templateRoot` into `targetPath` (later calls overwrite earlier files). */
function writeScaffoldFiles(templateRoot, targetPath, variables, featureName) {
  for (const templatePath of getFilesRecursive(templateRoot)) {
    const relativePath = relative(templateRoot, templatePath)
      .replace(/__FEATURE__/g, featureName)
      .split(/[\\/]/)
      .map((segment) => FILE_NAME_PLACEHOLDERS[segment] || segment)
      .join('/');
    const targetFilePath = join(targetPath, relativePath);
    mkdirSync(dirname(targetFilePath), { recursive: true });
    writeFileSync(targetFilePath, renderTemplate(readFileSync(templatePath, 'utf8'), variables));
  }
}

export function generatePackageJson({ componentId, packageName, tagline, tag, prefix, title, devPort, coreVersion, devkitVersion, logicClass }) {
  return {
    name: packageName,
    version: '0.1.0',
    description: tagline,
    type: 'module',
    license: 'MIT',
    author: 'KeenMate',
    homepage: `https://github.com/keenmate/${componentId}`,
    repository: { type: 'git', url: `git+https://github.com/keenmate/${componentId}.git` },
    keywords: ['web-components', 'custom-elements', 'keenmate', 'bliss', tag],
    main: `./dist/${componentId}.umd.js`,
    module: `./dist/${componentId}.js`,
    types: './dist/index.d.ts',
    customElements: 'custom-elements.json',
    'web-types': 'web-types.json',
    exports: {
      '.': { types: './dist/index.d.ts', import: `./dist/${componentId}.js`, require: `./dist/${componentId}.umd.js` },
      './style.css': './dist/style.css',
      './manifest': './component-variables.manifest.json',
      './component-variables.manifest.json': './component-variables.manifest.json',
      './custom-elements.json': './custom-elements.json',
      './package.json': './package.json',
    },
    files: [
      'dist',
      'docs',
      'component-variables.manifest.json',
      'custom-elements.json',
      'web-types.json',
      'vscode.html-custom-data.json',
      'vscode.css-custom-data.json',
      // Never ship AI-assistant guidance, even if a directory above gets added.
      ...PACKAGE_FILES_EXCLUSIONS,
    ],
    sideEffects: ['./dist/*.js', './dist/*.css', './src/index.ts', './src/web-component.ts', './src/css/*.css'],
    kmwc: {
      title,
      tagline,
      tag,
      prefix,
      library: { globalName: logicClass, fileName: componentId },
      ports: { dev: devPort, image: getPortsForBlock(devPort).image },
    },
    scripts: {
      dev: 'vite',
      analyze: 'cem analyze',
      build: 'npm run check:vars && npm run analyze && tsc --noEmit && vite build',
      'build:examples': 'vite build --mode examples',
      'preview:examples': 'vite preview --mode examples',
      typecheck: 'tsc --noEmit',
      'check:vars': 'kmwc check-vars --strict',
      doctor: 'kmwc doctor',
      prepublishOnly: 'npm run clean:dist && npm run build',
    },
    dependencies: {
      '@keenmate/web-components-core': `^${coreVersion}`,
    },
    devDependencies: {
      '@custom-elements-manifest/analyzer': '^0.11.0',
      '@keenmate/web-components-devkit': `^${devkitVersion}`,
      '@playwright/test': '^1.60.0',
      'custom-element-jet-brains-integration': '^1.7.0',
      'custom-element-vs-code-integration': '^1.5.0',
      typescript: '^5.9.3',
      vite: '^7.3.7',
    },
  };
}

export async function run(args) {
  const requestedName = args._[0];
  if (!requestedName) {
    throw new Error('usage: kmwc new <name> --prefix <2-4 letters> [--title "…"] [--tag …] [--dir …] [--port …] [--register] [--offline]');
  }

  const unscopedName = getUnscopedName(requestedName);
  const componentId = unscopedName.startsWith('web-') ? unscopedName : `web-${unscopedName}`;
  const packageName = `@keenmate/${componentId}`;
  const tag = args.tag || componentId;
  if (!/^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(tag)) throw new Error(`"${tag}" is not a valid custom-element tag (needs a dash)`);
  const featureName = tag.replace(/^web-/, '');
  const elementClass = `${mapToPascalCase(featureName)}Element`;
  const logicClass = mapToPascalCase(componentId);
  const title = args.title || mapToPascalCase(componentId).replace(/^Web/, 'Web ');
  const tagline = args.tagline || `${title} — a framework-agnostic web component.`;
  const targetPath = resolve(args.dir || join(DEVKIT_ROOT, '..', componentId));

  // ── intake ───────────────────────────────────────────────────────────────
  const registry = getRegistry();
  if (registry.components.some((entry) => entry.id === componentId)) throw new Error(`"${componentId}" is already in components.json`);
  if (existsSync(targetPath) && readdirSync(targetPath).length) throw new Error(`${targetPath} exists and is not empty`);

  const prefix = args.prefix || generatePrefix(componentId);
  if (!prefix) {
    throw new Error(
      `cannot derive a CSS prefix for "${componentId}" — is "${featureName}" one English word or several? ` +
        `Pass --prefix (initials of each word, e.g. daterangepicker → drp; component-intake.md "C — CSS prefix derivation").`
    );
  }
  const prefixError = checkPrefix(prefix, getReservedPrefixes(registry));
  if (prefixError) throw new Error(prefixError);

  if (!args.offline && checkIsPackageNameTaken(packageName)) throw new Error(`${packageName} already exists on npm (component-intake.md "B")`);

  const devPort = Number(args.port) || getNextPortBlock(registry);
  if (devPort % PORT_BLOCK_SIZE !== 0) throw new Error(`--port ${devPort} is not a port block (a multiple of ${PORT_BLOCK_SIZE})`);
  const portOwner = registry.components.find((entry) => entry.port === devPort);
  if (portOwner) throw new Error(`port block ${devPort} belongs to ${portOwner.id} — omit --port to take the next free block`);
  const corePackageJsonPath = join(DEVKIT_ROOT, '..', 'web-components-core', 'package.json');
  const coreVersion = existsSync(corePackageJsonPath) ? getJsonFile(corePackageJsonPath).version : '1.0.0-rc12';
  const today = new Date().toISOString().slice(0, 10);

  const variables = {
    ID: componentId,
    TAG: tag,
    FEATURE: featureName,
    ELEMENT_CLASS: elementClass,
    LOGIC_CLASS: logicClass,
    CONFIG_TYPE: `${mapToPascalCase(featureName)}Config`,
    EVENT_DETAIL_TYPE: `${mapToPascalCase(featureName)}EventDetail`,
    EVENTS_TYPE: `${mapToPascalCase(featureName)}Events`,
    PREFIX: prefix,
    LOG_NAME: featureName.replace(/-/g, '_').toUpperCase(),
    TITLE: title,
    TITLE_UPPER: title.toUpperCase(),
    TAGLINE: tagline,
    PACKAGE_NAME: packageName,
    FILE_NAME: componentId,
    VERSION: '0.1.0',
    TODAY: today,
    YEAR: today.slice(0, 4),
    DEV_PORT: devPort,
  };

  // ── scaffold files ───────────────────────────────────────────────────────
  const isMinimal = !!args.minimal;
  writeScaffoldFiles(SCAFFOLD_ROOT, targetPath, variables, featureName);
  if (isMinimal) writeScaffoldFiles(MINIMAL_OVERLAY_ROOT, targetPath, variables, featureName);

  const packageJson = generatePackageJson({
    componentId,
    packageName,
    tagline,
    tag,
    prefix,
    title,
    devPort,
    coreVersion,
    devkitVersion: getDevkitPackageJson().version,
    logicClass,
  });
  writeFileSync(join(targetPath, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✓ scaffolded ${componentId}${isMinimal ? ' (minimal)' : ''} in ${targetPath} (prefix ${prefix}, dev port ${devPort})`);

  // ── generated files (Dockerfile, Makefile, CLAUDE.md block, scripts) ─────
  await runSync({ root: targetPath });

  // ── registry ─────────────────────────────────────────────────────────────
  const registryEntry = {
    id: componentId,
    kind: 'component',
    prefix,
    path: relative(DEVKIT_ROOT, targetPath).replace(/\\/g, '/'),
    npm: packageName,
    repo: `https://github.com/keenmate/${componentId}`,
    port: devPort,
  };
  if (args.register) {
    const registryPath = join(DEVKIT_ROOT, 'components.json');
    const registryJson = getJsonFile(registryPath);
    const lastComponentIndex = registryJson.components.map((entry) => entry.kind).lastIndexOf('component');
    registryJson.components.splice(lastComponentIndex + 1, 0, registryEntry);
    writeFileSync(registryPath, JSON.stringify(registryJson, null, 2) + '\n');
    console.log('✓ registered in components.json — run `npm run readme` in the devkit to refresh the catalogue');
  } else {
    console.log(`\nAdd it to the devkit registry (components.json), or re-run with --register:\n${JSON.stringify(registryEntry, null, 2)}`);
  }

  console.log(
    `\nNext:\n` +
      `  1. Reserve the prefix "${prefix}" in BlissFramework guidelines/web-components/base-variables.md (and component-intake.md).\n` +
      `  2. cd ${relative(process.cwd(), targetPath) || '.'} && npm install\n` +
      `  3. npm run build        # check:vars + CEM analyze + typecheck + vite — commit the generated custom-elements.json & co.\n` +
      `  4. npm run dev          # http://localhost:${devPort}\n` +
      `  5. npx kmwc doctor`
  );
  return 0;
}
