import { MissingArgumentError, NotImplementedError } from '../errors.js';

/**
 * Handler for `rewind recover <id>`.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function recoverCommand({ context }) {
  const { parsedArgs } = context;
  const id = parsedArgs.positional[0];

  if (!id) {
    throw new MissingArgumentError('id', 'rewind recover <id>');
  }

  throw new NotImplementedError(
    'recover',
    `Command "recover" is not yet implemented in Phase 1 (incident ID: "${id}").`
  );
}
