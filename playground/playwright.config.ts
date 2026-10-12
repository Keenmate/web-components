import { definePlaywrightConfig, devices } from '@keenmate/web-components-devkit/playwright';

// The devkit's own e2e suite: every spec runs against the dev server AND the
// built examples site (vite preview on dev port + 1), so the plugin's dev and
// build paths are both covered.
const DEV = 'http://localhost:13900';
const BUILT = 'http://localhost:13901';

export default definePlaywrightConfig({
  projects: [
    { name: 'dev', use: { ...devices['Desktop Chrome'], baseURL: DEV } },
    { name: 'built', testIgnore: ['**/smoke.spec.ts', '**/dark-mode.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: BUILT } },
  ],
  webServer: [
    { command: 'npm run dev', url: DEV, reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'pipe' },
    {
      command: 'npm run build:examples && npm run preview:examples',
      url: BUILT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
