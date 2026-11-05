import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';

// `npm run test:e2e:coverage` (devkit root) sets this: every test on the dev server records
// Chromium's JS coverage of the devkit's browser code (src/examples/*, served unbundled), and
// scripts/e2e-coverage-report.mjs merges the files into a per-file line report. The built
// project is skipped — the same code, bundled.
const COVERAGE_DIR = process.env.KMWC_E2E_COVERAGE_DIR;
const COVERED_URL_PATTERN = /\/src\/examples\/[^?]+\.js(\?|$)/;

export const test = base.extend<{ recordCoverage: void }>({
  recordCoverage: [
    async ({ page, browserName }, use, testInfo) => {
      const isRecording = !!COVERAGE_DIR && browserName === 'chromium' && testInfo.project.name === 'dev';
      if (isRecording) await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      if (!isRecording) return;
      const entries = (await page.coverage.stopJSCoverage()).filter((entry) => COVERED_URL_PATTERN.test(entry.url));
      mkdirSync(COVERAGE_DIR, { recursive: true });
      writeFileSync(`${COVERAGE_DIR}/${randomUUID()}.json`, JSON.stringify(entries));
    },
    { auto: true },
  ],
});

export { expect };
