#!/usr/bin/env node
/**
 * kmwc — the Keenmate web-components devkit CLI.
 *
 *   kmwc sync [--check]               regenerate devkit-owned files from package.json#kmwc
 *   kmwc doctor [--json]              check this repo against the devkit + rulebook standard
 *   kmwc check-vars [--strict]        validate component-variables.manifest.json against the CSS
 *   kmwc check-pages [--url <u>]      every example page in Chromium: errors, undefined elements, overflow
 *   kmwc check-release --tag <tag>    gate a publish (version ⇔ dist-tag, not yet on npm)
 *   kmwc new <name> [options]         scaffold a new component repo next to the devkit
 *   kmwc readme [--check]             regenerate the devkit README catalogue (devkit repo only)
 *   kmwc <command> --help             that command's usage (never runs it)
 *
 * All commands act on the current directory (override with --root <dir>).
 * Each command module exports `run(args)` returning the process exit code; an
 * unknown option is an error (exit 2), never ignored.
 */
import { argv, exit } from 'node:process';
import { parseArgs, checkIsHelpRequested } from './args.js';

/** Every command: its module, the flags it takes and its usage text. */
const COMMANDS = {
  sync: {
    load: () => import('./commands/sync.js'),
    flags: { booleans: ['check'] },
    usage: `sync [--check]            Regenerate Dockerfile, nginx.conf, Makefile, .dockerignore,
                            the CLAUDE.md devkit block, .gitignore entries and missing
                            standard scripts. --check: report drift, write nothing.`,
  },
  doctor: {
    load: () => import('./commands/doctor.js'),
    flags: { booleans: ['json', 'verbose', 'no-rulebook', 'no-pack'] },
    usage: `doctor [--json]           Check this repo against the devkit standard and the
                            BlissFramework rulebook (*.checks.sh), and that npm pack ships no
                            dev-only files. --verbose, --no-rulebook, --no-pack.`,
  },
  'check-vars': {
    load: () => import('./commands/check-vars.js'),
    flags: { booleans: ['strict'] },
    usage: `check-vars [--strict]     Validate component-variables.manifest.json against the CSS.`,
  },
  'check-pages': {
    load: () => import('./commands/check-pages.js'),
    flags: { values: ['url', 'widths'] },
    usage: `check-pages [--url <u>]   Load every example page in Chromium at 1440 / 390 / 320px and report
                            page/console errors, failed requests, undefined elements and a page
                            wider than the viewport. Starts the dev server unless --url is given.
                            --widths 1440,390,320.`,
  },
  'check-release': {
    load: () => import('./commands/check-release.js'),
    flags: { booleans: ['offline'], values: ['tag'] },
    usage: `check-release --tag <t>   Gate a publish: latest ⇔ release version, rc ⇔ -rcN,
                            version not on npm yet. --offline skips the npm lookup.`,
  },
  new: {
    load: () => import('./commands/new.js'),
    flags: { booleans: ['register', 'minimal', 'adopt', 'offline'], values: ['title', 'tagline', 'tag', 'prefix', 'dir', 'port'] },
    usage: `new <name>                Scaffold a new component (e.g. \`kmwc new web-colorpicker --prefix cpk\`).
                            --title "…" --tagline "…" --tag … --prefix … --dir … --port …
                            --register --offline
                            --minimal: empty skeleton (no inputs/events) instead of the sample
                            --adopt: an already registered component (migration scratch scaffold)`,
  },
  readme: {
    load: () => import('./commands/readme.js'),
    flags: { booleans: ['check'] },
    usage: `readme [--check]          Regenerate the README catalogue from components.json (devkit repo).`,
  },
};

const GLOBAL_USAGE = `Global: --root <dir>        Act on <dir> instead of the current directory.
        --help, -h          Show the usage (of one command: kmwc <command> --help).`;

function renderUsage(commandName) {
  if (commandName) {
    console.log(`Usage: kmwc ${COMMANDS[commandName].usage}\n\n${GLOBAL_USAGE}`);
    return;
  }
  const commandLines = Object.values(COMMANDS).map((command) => `  ${command.usage}`).join('\n');
  console.log(`kmwc — Keenmate web-components devkit\n\nUsage: kmwc <command> [options]\n\n${commandLines}\n\n${GLOBAL_USAGE}`);
}

async function main() {
  const [commandName, ...commandArgs] = argv.slice(2);
  if (!commandName || ['help', '--help', '-h'].includes(commandName)) {
    renderUsage(COMMANDS[commandArgs[0]] ? commandArgs[0] : undefined);
    return 0;
  }
  const command = COMMANDS[commandName];
  if (!command) {
    console.error(`kmwc: unknown command "${commandName}"\n`);
    renderUsage();
    return 2;
  }
  // Help never runs the command (`kmwc sync --help` once overwrote a Makefile).
  if (checkIsHelpRequested(commandArgs)) {
    renderUsage(commandName);
    return 0;
  }
  let args;
  try {
    args = parseArgs(commandArgs, command.flags);
  } catch (error) {
    console.error(`kmwc ${commandName}: ${error.message}\n`);
    renderUsage(commandName);
    return 2;
  }
  const commandModule = await command.load();
  return (await commandModule.run(args)) ?? 0;
}

main().then(
  (exitCode) => exit(exitCode),
  (error) => {
    console.error(`kmwc: ${error?.message || error}`);
    if (process.env.KMWC_DEBUG) console.error(error);
    exit(1);
  }
);
