import { NotImplementedError } from '../errors.js';

/**
 * Handler for `rewind history [--json]`.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function historyCommand({ context }) {
  // In Phase 1 foundation, ledger history is not active.
  throw new NotImplementedError(
    'history',
    'Command "history" is not yet implemented in Phase 1.'
  );
}
