/**
 * npm run test:e2e:coverage — line coverage of the kit's browser code (src/examples/*.js)
 * by the playground e2e suite. Unit tests only load these modules in Node; the e2e specs run
 * them in Chromium, and this is how much of them they reach.
 *
 * Runs the dev-server project with KMWC_E2E_COVERAGE_DIR set (playground/e2e/coverage-fixture.ts
 * records Chromium's JS coverage per test), merges the files and prints covered / code lines per
 * module. `--report-only` re-prints the last run.
 *
 * The dev server serves these modules unbundled, with only import specifiers rewritten in
 * place, so the served lines are the source lines (a module whose line count differs is
 * reported as unmapped rather than guessed). A line counts as code unless it is blank or a
 * comment; it is covered when its first non-blank character ran. Approximate by design —
 * enough to see which modules and which blocks the specs never reach.
 *
 * Maintainer script, not shipped.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEVKIT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PLAYGROUND_ROOT = join(DEVKIT_ROOT, 'playground');
const COVERAGE_DIR = join(PLAYGROUND_ROOT, 'coverage-e2e');
const EXAMPLES_DIR = join(DEVKIT_ROOT, 'src', 'examples');
const FS_URL_PATTERN = /\/@fs\/([^?]+)/;
const COMMENT_LINE_PATTERN = /^(\/\/|\/\*|\*)/;

function runSpecs() {
  rmSync(COVERAGE_DIR, { recursive: true, force: true });
  const testRun = spawnSync('npx', ['playwright', 'test', '--project=dev', ...process.argv.slice(2).filter((arg) => arg !== '--report-only')], {
    cwd: PLAYGROUND_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, KMWC_E2E_COVERAGE_DIR: COVERAGE_DIR },
  });
  return testRun.status ?? 1;
}

/** Served URL → absolute source path, or null for anything outside src/examples. */
function getSourcePath(url) {
  const fsPath = url.match(FS_URL_PATTERN)?.[1];
  if (!fsPath) return null;
  const sourcePath = resolve(decodeURIComponent(fsPath).replace(/^\/(?=[A-Za-z]:)/, ''));
  return sourcePath.startsWith(EXAMPLES_DIR) ? sourcePath : null;
}

/** Character offset → execution count: ranges applied outer to inner, so a nested block's count wins. */
function getCharacterCounts(source, functions) {
  const counts = new Int32Array(source.length).fill(-1);
  const ranges = functions.flatMap((fn) => fn.ranges).sort((left, right) => left.startOffset - right.startOffset || right.endOffset - left.endOffset);
  for (const { startOffset, endOffset, count } of ranges) counts.fill(count, startOffset, Math.min(endOffset, source.length));
  return counts;
}

/** Per line: null (not code), true (ran), false (never ran). */
function getLineStates(source, functions) {
  const counts = getCharacterCounts(source, functions);
  const lineStates = [];
  let offset = 0;
  for (const line of source.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || COMMENT_LINE_PATTERN.test(trimmedLine)) lineStates.push(null);
    else lineStates.push(counts[offset + line.indexOf(trimmedLine[0])] > 0);
    offset += line.length + 1;
  }
  return lineStates;
}

function getCodeLineStates(sourceText) {
  return sourceText.split('\n').map((line) => (!line.trim() || COMMENT_LINE_PATTERN.test(line.trim()) ? null : false));
}

/** [3,4,5,9] → "3-5 9" */
function formatLineRanges(lineNumbers) {
  const ranges = [];
  for (const lineNumber of lineNumbers) {
    const lastRange = ranges.at(-1);
    if (lastRange && lineNumber === lastRange[1] + 1) lastRange[1] = lineNumber;
    else ranges.push([lineNumber, lineNumber]);
  }
  return ranges.map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`)).join(' ');
}

function printReport() {
  if (!existsSync(COVERAGE_DIR)) {
    console.error(`no coverage data in ${relative(DEVKIT_ROOT, COVERAGE_DIR)} — run without --report-only first`);
    return 1;
  }
  // Source path → merged line states (a line ran if it ran in any test).
  const fileStates = new Map();
  const unmappedFiles = new Set();
  for (const fileName of readdirSync(COVERAGE_DIR)) {
    for (const entry of JSON.parse(readFileSync(join(COVERAGE_DIR, fileName), 'utf8'))) {
      const sourcePath = getSourcePath(entry.url);
      if (!sourcePath || !existsSync(sourcePath)) continue;
      const diskLineCount = readFileSync(sourcePath, 'utf8').split('\n').length;
      const lineStates = getLineStates(entry.source, entry.functions);
      if (lineStates.length < diskLineCount) {
        unmappedFiles.add(sourcePath);
        continue;
      }
      const mergedStates = fileStates.get(sourcePath) || lineStates.slice(0, diskLineCount);
      lineStates.slice(0, diskLineCount).forEach((state, index) => {
        if (state) mergedStates[index] = true;
      });
      fileStates.set(sourcePath, mergedStates);
    }
  }
  // Modules no test loaded: every code line is uncovered.
  for (const fileName of readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.js'))) {
    const sourcePath = join(EXAMPLES_DIR, fileName);
    if (!fileStates.has(sourcePath) && !unmappedFiles.has(sourcePath)) fileStates.set(sourcePath, getCodeLineStates(readFileSync(sourcePath, 'utf8')));
  }

  let totalCodeLines = 0;
  let totalCoveredLines = 0;
  const rows = [...fileStates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, lineStates]) => {
      const codeLineCount = lineStates.filter((state) => state !== null).length;
      const coveredLineCount = lineStates.filter((state) => state === true).length;
      totalCodeLines += codeLineCount;
      totalCoveredLines += coveredLineCount;
      const uncoveredLines = lineStates.flatMap((state, index) => (state === false ? [index + 1] : []));
      const percent = codeLineCount ? (100 * coveredLineCount) / codeLineCount : 100;
      return { file: relative(DEVKIT_ROOT, sourcePath).replace(/\\/g, '/'), percent, coveredLineCount, codeLineCount, uncovered: formatLineRanges(uncoveredLines) };
    });

  const fileWidth = Math.max(...rows.map((row) => row.file.length), 'all files'.length);
  console.log(`\nkit browser code — line coverage by the playground e2e suite (dev server, ${readdirSync(COVERAGE_DIR).length} tests)\n`);
  console.log(`${'file'.padEnd(fileWidth)} | lines %  | covered / code | uncovered lines`);
  console.log('-'.repeat(fileWidth + 50));
  for (const row of rows) {
    console.log(`${row.file.padEnd(fileWidth)} | ${row.percent.toFixed(2).padStart(6)}   | ${`${row.coveredLineCount} / ${row.codeLineCount}`.padStart(14)} | ${row.uncovered}`);
  }
  console.log('-'.repeat(fileWidth + 50));
  const totalPercent = totalCodeLines ? (100 * totalCoveredLines) / totalCodeLines : 100;
  console.log(`${'all files'.padEnd(fileWidth)} | ${totalPercent.toFixed(2).padStart(6)}   | ${`${totalCoveredLines} / ${totalCodeLines}`.padStart(14)} |`);
  for (const sourcePath of unmappedFiles) console.log(`\n⚠ ${relative(DEVKIT_ROOT, sourcePath)}: served text has fewer lines than the source — not mapped`);
  return 0;
}

const isReportOnly = process.argv.includes('--report-only');
const testStatus = isReportOnly ? 0 : runSpecs();
const reportStatus = printReport();
process.exit(testStatus || reportStatus);
