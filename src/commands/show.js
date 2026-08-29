import { MissingArgumentError, NotImplementedError } from '../errors.js';

/**
 * Handler for `rewind show <id> [--json]`.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function showCommand({ context }) {
  const { parsedArgs } = context;
  const id = parsedArgs.positional[0];

  if (!id) {
    throw new MissingArgumentError('id', 'rewind show <id> [--json]');
  }

  throw new NotImplementedError(
    'show',
    `Command "show" is not yet implemented in Phase 1 (incident ID: "${id}").`
  );
}
