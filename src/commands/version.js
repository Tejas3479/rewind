import { VERSION } from '../config.js';
import { formatJson } from '../formatter.js';

/**
 * Handler for the version command / flag.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function versionCommand({ context }) {
  const { stdout, parsedArgs } = context;

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({ name: 'rewind', version: VERSION }) + '\n');
  } else {
    stdout.write(`rewind v${VERSION}\n`);
  }

  return 0;
}
