#!/usr/bin/env node
/**
 * kmwc — the KeenMate web-components devkit CLI.
 *
 *   kmwc sync [--check]               regenerate devkit-owned files from package.json#kmwc
 *   kmwc doctor [--json]              check this repo against the devkit + rulebook standard
 *   kmwc check-vars [--strict]        validate component-variables.manifest.json against the CSS
 *   kmwc check-release --tag <tag>    gate a publish (version ⇔ dist-tag, not yet on npm)
 *   kmwc new <name> [options]         scaffold a new component repo next to the devkit
 *   kmwc readme [--check]             regenerate the devkit README catalogue (devkit repo only)
 *
 * All commands act on the current directory (override with --root <dir>).
 * Each command module exports `run(args)` returning the process exit code.
 */
import { argv, exit } from 'node:process';
import { parseArgs } from './args.js';

const COMMAND_LOADERS = {
  sync: () => import('./commands/sync.js'),
  doctor: () => import('./commands/doctor.js'),
  'check-vars': () => import('./commands/check-vars.js'),
  'check-release': () => import('./commands/check-release.js'),
  new: () => import('./commands/new.js'),
  readme: () => import('./commands/readme.js'),
};

function renderUsage() {
  console.log(`kmwc — KeenMate web-components devkit

Usage: kmwc <command> [options]

  sync [--check]            Regenerate Dockerfile, nginx.conf, Makefile, .dockerignore,
                            the CLAUDE.md devkit block, .gitignore entries and missing
                            standard scripts. --check: report drift, write nothing.
  doctor [--json]           Check this repo against the devkit standard and the
                            BlissFramework rulebook (*.checks.sh), and that npm pack ships no
                            dev-only files. --verbose, --no-rulebook, --no-pack.
  check-vars [--strict]     Validate component-variables.manifest.json against the CSS.
  check-release --tag <t>   Gate a publish: latest ⇔ release version, rc ⇔ -rcN,
                            version not on npm yet. --offline skips the npm lookup.
  new <name>                Scaffold a new component (e.g. \`kmwc new web-colorpicker --prefix cpk\`).
                            --title "…" --tag … --prefix … --dir … --port … --register
                            --minimal: empty skeleton (no inputs/events) instead of the sample
  readme [--check]          Regenerate the README catalogue from components.json (devkit repo).

Global: --root <dir>        Act on <dir> instead of the current directory.`);
}

async function main() {
  const [commandName, ...commandArgs] = argv.slice(2);
  if (!commandName || ['help', '--help', '-h'].includes(commandName)) {
    renderUsage();
    return 0;
  }
  const loadCommand = COMMAND_LOADERS[commandName];
  if (!loadCommand) {
    console.error(`kmwc: unknown command "${commandName}"\n`);
    renderUsage();
    return 2;
  }
  const command = await loadCommand();
  return (await command.run(parseArgs(commandArgs))) ?? 0;
}

main().then(
  (exitCode) => exit(exitCode),
  (error) => {
    console.error(`kmwc: ${error?.message || error}`);
    if (process.env.KMWC_DEBUG) console.error(error);
    exit(1);
  }
);
