import { InvalidArgumentError } from './errors.js';

/**
 * Result of parsing CLI arguments.
 * @typedef {object} ParsedArgs
 * @property {string|null} command - The subcommand to run (e.g. 'run', 'history', 'show', 'recover', 'verify', 'help')
 * @property {string[]} positional - Positional arguments for the subcommand
 * @property {object} flags - Parsed flags
 * @property {boolean} flags.help - Whether --help / -h was requested
 * @property {boolean} flags.version - Whether --version / -v was requested
 * @property {boolean} flags.json - Whether --json was requested
 * @property {boolean} flags.noColor - Whether --no-color was requested
 * @property {string|null} flags.root - Custom root directory path
 * @property {string[]} raw - The original raw argument array
 */

/**
 * Parses raw argv arguments into structured command, positional args, and flags.
 *
 * @param {string[]} rawArgs - Array of argument strings (e.g. process.argv.slice(2))
 * @returns {ParsedArgs}
 */
export function parseArgs(rawArgs = []) {
  const flags = {
    help: false,
    version: false,
    json: false,
    noColor: false,
    root: null
  };

  const positional = [];
  let command = null;
  let i = 0;

  while (i < rawArgs.length) {
    const arg = rawArgs[i];

    // If we have already identified the command as 'run', all remaining tokens are part of the target command
    if (command === 'run') {
      positional.push(arg);
      i++;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      i++;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
      i++;
    } else if (arg === '--json') {
      flags.json = true;
      i++;
    } else if (arg === '--no-color') {
      flags.noColor = true;
      i++;
    } else if (arg === '--root') {
      i++;
      if (i >= rawArgs.length || rawArgs[i].startsWith('-')) {
        throw new InvalidArgumentError('Option "--root" requires a path argument.');
      }
      flags.root = rawArgs[i];
      i++;
    } else if (arg.startsWith('--root=')) {
      const val = arg.slice('--root='.length);
      if (!val) {
        throw new InvalidArgumentError('Option "--root" requires a path argument.');
      }
      flags.root = val;
      i++;
    } else if (arg.startsWith('-')) {
      throw new InvalidArgumentError(`Unknown option: "${arg}". Run "rewind --help" for usage.`);
    } else {
      if (command === null) {
        command = arg;
      } else {
        positional.push(arg);
      }
      i++;
    }
  }

  // Support "rewind help [subcommand]" by normalizing to help flag / command
  if (command === 'help') {
    flags.help = true;
    if (positional.length > 0) {
      command = positional[0];
      positional.shift();
    } else {
      command = null;
    }
  }

  return {
    command,
    positional,
    flags,
    raw: [...rawArgs]
  };
}
