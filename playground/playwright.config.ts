import { readFileSync } from 'node:fs';
import { definePlaywrightConfig, devices } from '@keenmate/web-components-devkit/playwright';

// The devkit's own e2e suite: every spec runs against the dev server AND the
// built examples site (vite preview on the block's preview port), so the
// plugin's dev and build paths are both covered. Ports come from
// package.json#kmwc.ports — never hardcode them.
const { dev: devPort } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).kmwc.ports;
const DEV_URL = `http://localhost:${devPort}`;
const BUILT_URL = `http://localhost:${devPort + 1}`;

export default definePlaywrightConfig({
  projects: [
    { name: 'dev', use: { ...devices['Desktop Chrome'], baseURL: DEV_URL } },
    { name: 'built', testIgnore: ['**/smoke.spec.ts', '**/dark-mode.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: BUILT_URL } },
  ],
  webServer: [
    { command: 'npm run dev', url: DEV_URL, reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'pipe' },
    {
      command: 'npm run build:examples && npm run preview:examples',
      url: BUILT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
