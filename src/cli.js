import { parseArgs } from './parser.js';
import { resolveConfig } from './config.js';
import { createStyler, shouldEnableColor, formatError, formatJson } from './formatter.js';
import { dispatch } from './router.js';
import { CliError, ExitCodes } from './errors.js';

/**
 * @typedef {object} CliContext
 * @property {string[]} argv
 * @property {import('./parser.js').ParsedArgs} parsedArgs
 * @property {ReturnType<import('./config.js').resolveConfig>} config
 * @property {ReturnType<import('./formatter.js').createStyler>} styler
 * @property {NodeJS.WritableStream} stdout
 * @property {NodeJS.WritableStream} stderr
 * @property {NodeJS.ReadableStream} stdin
 * @property {Record<string, string>} env
 * @property {string} cwd
 */

/**
 * Runs the Rewind CLI command line interface.
 *
 * @param {string[]} [argv=process.argv.slice(2)]
 * @param {object} [io]
 * @param {NodeJS.ReadableStream} [io.stdin=process.stdin]
 * @param {NodeJS.WritableStream} [io.stdout=process.stdout]
 * @param {NodeJS.WritableStream} [io.stderr=process.stderr]
 * @param {Record<string, string>} [io.env=process.env]
 * @param {string} [io.cwd=process.cwd()]
 * @param {boolean} [io.isTTY]
 * @returns {Promise<number>} Exit code (0 for success, non-zero for error)
 */
export async function runCLI(
  argv = process.argv.slice(2),
  {
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    env = process.env,
    cwd = process.cwd(),
    isTTY = Boolean(process.stdout?.isTTY)
  } = {}
) {
  let parsedArgs = null;
  let styler = createStyler(false);

  try {
    // 1. Argument parsing
    parsedArgs = parseArgs(argv);

    // 2. Setup Styler (NO_COLOR, FORCE_COLOR, isTTY, --no-color flag)
    const colorEnabled = shouldEnableColor({
      isTTY,
      env,
      noColorFlag: parsedArgs.flags.noColor
    });
    styler = createStyler(colorEnabled);

    // 3. Configuration & Root discovery
    const config = resolveConfig({
      cliRoot: parsedArgs.flags.root,
      env,
      cwd
    });

    // 4. Build Context
    /** @type {CliContext} */
    const context = {
      argv,
      parsedArgs,
      config,
      styler,
      stdout,
      stderr,
      stdin,
      env,
      cwd
    };

    // 5. Dispatch command
    const exitCode = await dispatch({ context });
    return typeof exitCode === 'number' ? exitCode : ExitCodes.SUCCESS;
  } catch (err) {
    const isCliError = err instanceof CliError;
    const exitCode = isCliError ? err.exitCode : ExitCodes.FAILURE;
    const isJsonMode = Boolean(parsedArgs?.flags?.json);

    if (isJsonMode) {
      const errorPayload = {
        status: 'error',
        error: {
          name: err?.name || 'Error',
          code: err?.code || 'ERR_INTERNAL',
          message: err?.message || 'An unexpected internal error occurred.',
          exitCode
        }
      };
      stdout.write(formatJson(errorPayload) + '\n');
    } else {
      stderr.write(formatError(err, styler) + '\n');
    }

    return exitCode;
  }
}
