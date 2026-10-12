/** The `kmwc` section of a component's package.json — every field optional (defaults in `mapKmwcConfig`). */
export interface KmwcPackageConfig {
  /** Registry id; defaults to the unscoped package name. */
  id?: string;
  /** Human title shown on the examples index header. */
  title?: string;
  /** One-line pitch under the title; defaults to package.json `description`. */
  tagline?: string;
  /** Custom-element tag the package registers. */
  tag?: string;
  /** Reserved CSS prefix (base-variables.md "Existing prefixes"), e.g. `ms`. */
  prefix?: string;
  library?: {
    entry?: string;
    /** UMD global name. */
    globalName?: string;
    /** Output basename → `dist/<fileName>.js` + `dist/<fileName>.umd.js`. */
    fileName?: string;
    formats?: Array<'es' | 'umd' | 'cjs' | 'iife'>;
    /** Lib-mode CSS basename (default `style` → dist/style.css). */
    cssFileName?: string;
    /** Emit rolled-up `.d.ts` via vite-plugin-dts. */
    shouldEmitTypes?: boolean;
    /** Extra vite-plugin-dts config. */
    typesPluginConfig?: Record<string, unknown>;
    shouldEmitSourcemap?: boolean;
    external?: string[];
  };
  ports?: { dev?: number; image?: number };
  theme?: { accentColor?: string; accentEndColor?: string };
  examples?: {
    outDir?: string;
    /** Production origin for copy-link deep links. */
    canonicalOrigin?: string;
    /** Extra dirs/files copied verbatim into the examples build (fetched at runtime). */
    staticPaths?: string[];
    /** Root HTML files NOT to build as example pages. */
    excludedPages?: string[];
    /** localStorage namespace for the controls persistence; defaults to `id`. */
    storagePrefix?: string;
  };
  analytics?: { plausibleSiteId?: string; plausibleHostUrl?: string };
  image?: {
    name?: string;
    container?: string;
    runner?: 'podman' | 'docker';
    nodeImage?: string;
    /** package.json files copied before install (monorepos list workspace manifests). */
    packageJsonPaths?: string[];
    installCommand?: string;
  };
  cssVariables?: {
    manifest?: string;
    /** Directories (stylesheets scanned) or explicit files (any type, e.g. a built bundle). */
    sources?: string[];
    /** Prefixed names (without `--`) that are runtime internals, not theming knobs. */
    internalVariables?: string[];
    /** `declared`: manifest ⇔ `--x:` declarations; `consumed`: manifest ⇔ `var(--x)` reads. */
    checkMode?: 'declared' | 'consumed';
  };
  rulebook?: {
    /** Path to BlissFramework `guidelines/web-components` (env KMWC_RULEBOOK_PATH wins). */
    path?: string;
    /** Rulebook check suites to skip, e.g. `["responsive-overlay"]`. */
    skippedChecks?: string[];
  };
  sync?: { skippedFiles?: string[] };
}

export interface KmwcConfig {
  root: string;
  hasPackageConfig: boolean;
  packageJson: Record<string, any>;
  id: string;
  packageName: string;
  version: string;
  title: string;
  tagline: string;
  tag: string;
  prefix: string;
  repository: string;
  homepage: string;
  author: string;
  license: string;
  library: {
    entry: string;
    globalName: string;
    fileName: string;
    formats: Array<'es' | 'umd' | 'cjs' | 'iife'>;
    cssFileName: string;
    shouldEmitTypes: boolean;
    typesPluginConfig: Record<string, unknown>;
    shouldEmitSourcemap: boolean;
    external: string[];
  };
  ports: { dev: number; image: number };
  theme: { accentColor: string; accentEndColor: string };
  examples: {
    outDir: string;
    canonicalOrigin: string;
    staticPaths: string[];
    excludedPages: string[];
    storagePrefix: string;
  };
  analytics: { plausibleSiteId: string; plausibleHostUrl: string };
  image: {
    name: string;
    container: string;
    runner: string;
    nodeImage: string;
    packageJsonPaths: string[];
    installCommand: string;
  };
  cssVariables: {
    manifest: string;
    sources: string[];
    internalVariables: string[];
    checkMode: 'declared' | 'consumed';
  };
  rulebook: { path: string; skippedChecks: string[] };
  sync: { skippedFiles: string[] };
}

export const DEVKIT_ROOT: string;
export const DEFAULT_RULEBOOK_PATH: string;
export const LEGACY_FILES: string[];
export const NON_PAGE_HTML_FILES: string[];
export function getPeerModule(root: string, moduleId: string): any;
export function loadPeerModule(root: string, moduleId: string): Promise<any>;
export function getJsonFile(filePath: string): any;
export function getDevkitPackageJson(): Record<string, any>;
export function getRegistry(): { components: Array<Record<string, any>> };
export function getUnscopedName(packageName: string): string;
export function mapToTitleCase(id: string): string;
export function mapToPascalCase(id: string): string;
export function getKmwcConfig(root?: string): KmwcConfig;
export function mapKmwcConfig(packageJson: Record<string, any>, root?: string): KmwcConfig;
export function generateBuildDefines(config: KmwcConfig): Record<string, string>;
