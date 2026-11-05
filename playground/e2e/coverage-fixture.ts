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
      if (!isRecording) return use();
      // Chromium only reports the scripts of the CURRENT document (resetOnNavigation: false
      // doesn't bring back a replaced one), so take a snapshot before every navigation the
      // test starts. A link click that navigates still loses what ran on the page it left.
      const entries: Awaited<ReturnType<typeof page.coverage.stopJSCoverage>> = [];
      const takeSnapshot = async () => {
        entries.push(...(await page.coverage.stopJSCoverage()).filter((entry) => COVERED_URL_PATTERN.test(entry.url)));
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      };
      for (const methodName of ['goto', 'reload', 'goBack', 'goForward'] as const) {
        const navigate = page[methodName].bind(page) as (...args: unknown[]) => Promise<unknown>;
        (page as unknown as Record<string, unknown>)[methodName] = async (...args: unknown[]) => {
          await takeSnapshot();
          return navigate(...args);
        };
      }
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      entries.push(...(await page.coverage.stopJSCoverage()).filter((entry) => COVERED_URL_PATTERN.test(entry.url)));
      mkdirSync(COVERAGE_DIR, { recursive: true });
      writeFileSync(`${COVERAGE_DIR}/${randomUUID()}.json`, JSON.stringify(entries));
    },
    { auto: true },
  ],
});

export { expect };
