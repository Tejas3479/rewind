import { MissingArgumentError, NotImplementedError } from '../errors.js';

/**
 * Handler for `rewind verify <id>`.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function verifyCommand({ context }) {
  const { parsedArgs } = context;
  const id = parsedArgs.positional[0];

  if (!id) {
    throw new MissingArgumentError('id', 'rewind verify <id>');
  }

  throw new NotImplementedError(
    'verify',
    `Command "verify" is not yet implemented in Phase 1 (incident ID: "${id}").`
  );
}
