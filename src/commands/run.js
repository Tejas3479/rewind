import { MissingArgumentError, NotImplementedError } from '../errors.js';

/**
 * Handler for `rewind run <command...>`.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function runCommand({ context }) {
  const { parsedArgs } = context;
  const targetCommand = parsedArgs.positional;

  if (!targetCommand || targetCommand.length === 0) {
    throw new MissingArgumentError('command', 'rewind run <command...>');
  }

  // In Phase 1 foundation, process execution is not active.
  throw new NotImplementedError(
    'run',
    `Command "run" is not yet implemented in Phase 1 (target command received: "${targetCommand.join(' ')}").`
  );
}
