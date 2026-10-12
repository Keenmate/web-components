/**
 * `@keenmate/web-components-devkit/playwright` — the shared Playwright preset.
 *
 *     import { definePlaywrightConfig } from '@keenmate/web-components-devkit/playwright';
 *     export default definePlaywrightConfig();
 *
 * Specs live in e2e/ and target fixture pages under test/*.html, served by the
 * component's own dev server on kmwc.ports.dev (read from package.json, so the
 * port can't drift from vite.config / the Makefile). Pass `projects` to add
 * e.g. a touch-only mobile project; anything else is shallow-merged on top.
 */
import { getKmwcConfig, getPeerModule } from '../config.js';

/** The component's own @playwright/test (see getPeerModule). */
function getPlaywright(root = process.cwd()) {
  return getPeerModule(root, '@playwright/test');
}

/** Playwright's device descriptors, from the component's install. */
export const devices = new Proxy({}, { get: (_, deviceName) => getPlaywright().devices[deviceName] });

/** @param {import('./index.js').PlaywrightPresetConfig} [presetConfig] */
export function definePlaywrightConfig(presetConfig = {}) {
  const { root, projects, use, webServer, ...restConfig } = presetConfig;
  const config = getKmwcConfig(root);
  const { defineConfig, devices: playwrightDevices } = getPlaywright(config.root);
  const baseUrl = `http://localhost:${config.ports.dev}`;
  const isCi = !!process.env.CI;

  return defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    forbidOnly: isCi,
    retries: isCi ? 2 : 0,
    workers: isCi ? 1 : undefined,
    reporter: isCi ? 'github' : 'list',
    use: {
      baseURL: baseUrl,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      ...use,
    },
    projects: projects || [
      {
        name: 'chromium',
        use: { ...playwrightDevices['Desktop Chrome'], viewport: { width: 1440, height: 1024 } },
      },
    ],
    // An array (e.g. dev server + examples preview) is taken as-is.
    webServer: Array.isArray(webServer)
      ? webServer
      : {
          command: 'npm run dev',
          url: baseUrl,
          reuseExistingServer: !isCi,
          timeout: 60_000,
          stdout: 'ignore',
          stderr: 'pipe',
          ...webServer,
        },
    ...restConfig,
  });
}
