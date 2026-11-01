/**
 * Flag parser: --flag, --key value, --key=value, positionals. `flagSpec` names
 * every flag a command takes — `booleans` never take a value, `values` always
 * do. Anything else is an error: an ignored typo (or `--help` before it was
 * handled) used to run the command for real.
 *
 * @param {string[]} args
 * @param {{ booleans?: string[], values?: string[] }} [flagSpec]
 */
export function parseArgs(args, flagSpec = {}) {
  const booleanFlags = new Set(flagSpec.booleans || []);
  const valueFlags = new Set(['root', ...(flagSpec.values || [])]);
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-') || arg === '-') {
      out._.push(arg);
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`unknown option "${arg}"`);
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    if (booleanFlags.has(key)) {
      if (inline !== undefined) throw new Error(`--${key} takes no value`);
      out[key] = true;
    } else if (valueFlags.has(key)) {
      if (inline !== undefined) out[key] = inline;
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) out[key] = args[++i];
      else throw new Error(`--${key} needs a value`);
    } else {
      throw new Error(`unknown option "--${key}"`);
    }
  }
  return out;
}

/** True when the arguments ask for help (`--help` or `-h` anywhere). */
export function checkIsHelpRequested(args) {
  return args.some((arg) => arg === '--help' || arg === '-h');
}
