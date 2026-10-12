/**
 * `@keenmate/web-components-devkit/vite` — the shared Vite preset.
 *
 * A component's whole vite.config.ts becomes:
 *
 *     import { defineComponentConfig } from '@keenmate/web-components-devkit/vite';
 *     export default defineComponentConfig();
 *
 * Everything else comes from package.json#kmwc. Three modes:
 *
 *   vite                          dev server on kmwc.ports.dev (strict — no port hopping)
 *   vite build                    library build → dist/<fileName>.js + .umd.js + style.css (+ .d.ts)
 *   vite build --mode examples    static example site → dist-examples/ (every root *.html is a page)
 *
 * The examples plugin injects the shared kit (styles, chapter nav, copy-link,
 * version badge) into every root-level page, so pages carry only their own
 * content — no per-repo copies of the helper scripts or the shared stylesheet.
 */
import { readdirSync, existsSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getKmwcConfig, getDevkitPackageJson, generateBuildDefines, loadPeerModule, DEVKIT_ROOT, NON_PAGE_HTML_FILES } from '../config.js';
import { renderThemeBootstrapScript } from '../examples/theme-switch.js';
import { composePage } from './page-composer.js';

const AUTO_ENTRY_PATH = join(DEVKIT_ROOT, 'src', 'examples', 'auto.js');
const VIRTUAL_AUTO_ID = 'virtual:kmwc-examples';
const EXAMPLES_MODE = 'examples';

/** Root-level HTML pages to build as the examples site. */
export function getExamplePages(config) {
  const skippedPages = new Set([...NON_PAGE_HTML_FILES, ...config.examples.excludedPages]);
  return Object.fromEntries(
    readdirSync(config.root)
      .filter((fileName) => fileName.endsWith('.html') && !skippedPages.has(fileName))
      .map((fileName) => [fileName.replace(/\.html$/, ''), resolve(config.root, fileName)])
  );
}

function getBuildTimestamp() {
  return new Date().toISOString().slice(0, 16) + 'Z';
}

const mapToScriptSafeJson = (json) => json.replace(/</g, '\\u003c');

/** Plausible snippet for the given site id (build only). */
function renderPlausibleSnippet(config) {
  const scriptUrl = `${config.analytics.plausibleHostUrl.replace(/\/$/, '')}/js/${config.analytics.plausibleSiteId}.js`;
  return (
    `<!-- Privacy-friendly analytics by Plausible (injected by kmwc at build time) -->\n` +
    `<script async src="${scriptUrl}"></script>\n` +
    `<script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>\n`
  );
}

/**
 * The examples plugin. Usually wired by `defineComponentConfig()`; exported for
 * repos (monorepos, showcases) that assemble their own Vite config.
 *
 * @param {import('./index.js').ExamplesPluginConfig} [pluginConfig]
 */
export function createExamplesPlugin(pluginConfig = {}) {
  const config = getKmwcConfig(pluginConfig.root);
  let command = 'serve';
  let mode = 'development';
  let outDir = config.examples.outDir;
  const buildTimestamp = process.env.BUILD_TIME || getBuildTimestamp();
  const devkitPackageJson = getDevkitPackageJson();

  return {
    name: 'kmwc-examples',

    configResolved(resolvedConfig) {
      command = resolvedConfig.command;
      mode = resolvedConfig.mode;
      outDir = resolvedConfig.build.outDir;
    },

    resolveId(moduleId) {
      return moduleId === VIRTUAL_AUTO_ID ? AUTO_ENTRY_PATH : null;
    },

    // A partial isn't a module, so Vite doesn't know which pages use it —
    // reload the page on any non-root HTML change (partials/…).
    handleHotUpdate({ file, server }) {
      const relativePath = file.replace(/\\/g, '/').replace(config.root.replace(/\\/g, '/') + '/', '');
      if (relativePath.endsWith('.html') && relativePath.includes('/') && !relativePath.startsWith('test/')) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
      return undefined;
    },

    transformIndexHtml: {
      // `pre`: run before Vite processes the HTML, so the injected module script
      // is bundled exactly like an authored one (dev and build alike).
      order: 'pre',
      handler(html, context) {
        // Only root-level pages are example pages — test fixtures under test/
        // (Playwright) stay bare. A page can opt out with <html data-kmwc="off">.
        if (context.path.split('/').filter(Boolean).length > 1) return html;
        if (/<html[^>]*\sdata-kmwc=["']?off/i.test(html)) return html;

        // Includes, demos and — for fragment pages — the shared layout
        // (page-composer.js). Full documents pass through untouched.
        html = composePage(html, { config, pagePath: context.path });

        const isBuild = command === 'build';
        const pageConfig = {
          id: config.id,
          title: config.title,
          tagline: config.tagline,
          version: config.version,
          packageName: config.packageName,
          buildTimestamp: isBuild ? buildTimestamp : null,
          mode: isBuild ? 'build' : 'dev',
          canonicalOrigin: config.examples.canonicalOrigin,
          storagePrefix: config.examples.storagePrefix,
          repository: config.repository,
          homepage: config.homepage,
          devkitVersion: devkitPackageJson.version,
          devkitHomepage: devkitPackageJson.homepage,
        };

        let headHtml =
          `<script>${renderThemeBootstrapScript()}</script>\n` +
          `<script>window.__KMWC__=${mapToScriptSafeJson(JSON.stringify(pageConfig))};</script>\n`;
        const accentDeclarations = [
          config.theme.accentColor && `--kmwc-accent-color:${config.theme.accentColor}`,
          config.theme.accentEndColor && `--kmwc-accent-end-color:${config.theme.accentEndColor}`,
        ].filter(Boolean);
        if (accentDeclarations.length) headHtml += `<style>:root{${accentDeclarations.join(';')}}</style>\n`;

        const shouldInjectAnalytics = pluginConfig.shouldInjectAnalytics ?? isBuild;
        if (shouldInjectAnalytics && config.analytics.plausibleSiteId) headHtml = renderPlausibleSnippet(config) + headHtml;

        const bodyHtml = `<script type="module">import '${VIRTUAL_AUTO_ID}';</script>\n`;

        html = /<head[^>]*>/i.test(html)
          ? html.replace(/<head[^>]*>/i, (headTag) => `${headTag}\n${headHtml}`)
          : headHtml + html;
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bodyHtml}</body>`) : html + bodyHtml;
        return html;
      },
    },

    // Runtime-fetched assets (demo JSON, docs) aren't in the module graph —
    // copy them verbatim next to the built pages.
    closeBundle() {
      if (command !== 'build' || mode !== EXAMPLES_MODE) return;
      for (const staticPath of config.examples.staticPaths) {
        const sourcePath = resolve(config.root, staticPath);
        if (!existsSync(sourcePath)) {
          this.warn?.(`kmwc: examples.staticPaths entry "${staticPath}" does not exist — skipped`);
          continue;
        }
        cpSync(sourcePath, resolve(config.root, outDir, staticPath), { recursive: true });
      }
    },
  };
}

/**
 * The full preset. `presetConfig.overrides` is deep-merged last; for values
 * that depend on the Vite env, use `getOverridesCallback(env, config)`. A repo
 * keeps its genuinely-specific bits — extra plugins, aliases, optimizeDeps —
 * without forking the base.
 *
 * @param {import('./index.js').VitePresetConfig} [presetConfig]
 */
export function defineComponentConfig(presetConfig = {}) {
  return async (env) => {
    const config = getKmwcConfig(presetConfig.root);
    // The component's own vite — the one running this config (see loadPeerModule).
    const { mergeConfig, searchForWorkspaceRoot } = await loadPeerModule(config.root, 'vite');
    const library = { ...config.library, ...(presetConfig.library || {}) };
    const isExamplesMode = env.mode === EXAMPLES_MODE;
    const isLibraryBuild = env.command === 'build' && !isExamplesMode;

    const plugins = [createExamplesPlugin({ root: config.root }), ...(presetConfig.plugins || [])];

    if (isLibraryBuild && library.shouldEmitTypes) {
      const { default: createTypesPlugin } = await import('vite-plugin-dts');
      plugins.push(createTypesPlugin({ rollupTypes: true, ...library.typesPluginConfig }));
    }

    const baseConfig = {
      root: config.root,
      appType: 'mpa',
      // Relative asset URLs in the examples build, so the site works from any
      // sub-path (or a plain file preview), not just a domain root.
      ...(isExamplesMode && env.command === 'build' ? { base: './' } : {}),
      define: generateBuildDefines(config),
      plugins,
      server: {
        port: config.ports.dev,
        strictPort: true,
        fs: {
          // The devkit may be a sibling checkout (file: link) — let the dev
          // server read its example-kit files.
          allow: [searchForWorkspaceRoot(config.root), DEVKIT_ROOT],
        },
      },
      preview: {
        port: config.ports.preview,
        strictPort: true,
      },
      build: isExamplesMode
        ? {
            outDir: config.examples.outDir,
            emptyOutDir: true,
            rollupOptions: { input: getExamplePages(config) },
          }
        : {
            sourcemap: library.shouldEmitSourcemap,
            lib: {
              entry: resolve(config.root, library.entry),
              name: library.globalName,
              formats: library.formats,
              cssFileName: library.cssFileName,
              fileName: (format) => `${library.fileName}.${format === 'es' ? 'js' : `${format}.js`}`,
            },
            rollupOptions: {
              external: library.external,
            },
          },
    };

    let mergedConfig = presetConfig.overrides ? mergeConfig(baseConfig, presetConfig.overrides) : baseConfig;
    if (presetConfig.getOverridesCallback) {
      mergedConfig = mergeConfig(mergedConfig, await presetConfig.getOverridesCallback(env, config));
    }
    return mergedConfig;
  };
}
