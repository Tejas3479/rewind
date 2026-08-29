import { UnknownCommandError } from './errors.js';
import { helpCommand } from './commands/help.js';
import { versionCommand } from './commands/version.js';
import { runCommand } from './commands/run.js';
import { historyCommand } from './commands/history.js';
import { showCommand } from './commands/show.js';
import { recoverCommand } from './commands/recover.js';
import { verifyCommand } from './commands/verify.js';
import { searchCommand } from './commands/search.js';
import { verifyIntegrityCommand } from './commands/verify_integrity.js';
import { rebuildCommand } from './commands/rebuild.js';
import { patternsCommand } from './commands/patterns.js';
import { contextCommand } from './commands/context.js';

export const COMMANDS = Object.freeze({
  run: runCommand,
  history: historyCommand,
  show: showCommand,
  recover: recoverCommand,
  verify: verifyCommand,
  search: searchCommand,
  patterns: patternsCommand,
  context: contextCommand,
  'verify-integrity': verifyIntegrityCommand,
  verify_integrity: verifyIntegrityCommand,
  rebuild: rebuildCommand,
  help: helpCommand,
  version: versionCommand
});

/**
 * Dispatches parsed arguments to the appropriate command handler.
 *
 * @param {object} params
 * @param {import('./cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function dispatch({ context }) {
  const { parsedArgs } = context;

  // Handle global --version / -v flag
  if (parsedArgs.flags.version) {
    return await versionCommand({ context });
  }

  // Handle global --help / -h flag or explicit 'help' command
  if (parsedArgs.flags.help) {
    return await helpCommand({ commandName: parsedArgs.command, context });
  }

  // If no command provided, display top-level help
  if (!parsedArgs.command) {
    return await helpCommand({ commandName: null, context });
  }

  const handler = COMMANDS[parsedArgs.command];
  if (!handler) {
    throw new UnknownCommandError(parsedArgs.command);
  }

  return await handler({ context });
}
