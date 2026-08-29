import { MissingArgumentError } from '../errors.js';
import { executeAndCapture } from '../capture.js';
import { formatJson } from '../formatter.js';

/**
 * Handler for `rewind run <command...>`.
 * Executes the user-requested process, streams output live, captures all diagnostic
 * lifecycle evidence, and strictly propagates the child process's exit code.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>} - Child process exit code
 */
export async function runCommand({ context }) {
  const { parsedArgs, config, env, stdout, stderr } = context;
  const targetCommand = parsedArgs.positional;

  if (!targetCommand || targetCommand.length === 0) {
    throw new MissingArgumentError('command', 'rewind run <command...>');
  }

  const isJsonMode = Boolean(parsedArgs.flags.json);

  // If in JSON mode, avoid multiplexing live stream to stdout to preserve pure JSON output
  const stdoutStream = isJsonMode ? null : stdout;
  const stderrStream = isJsonMode ? null : stderr;

  const result = await executeAndCapture(targetCommand, {
    cwd: config.rootDir,
    env,
    stdoutStream,
    stderrStream
  });

  if (isJsonMode) {
    stdout.write(formatJson({
      status: result.success ? 'success' : 'failure',
      data: result
    }) + '\n');
  }

  // Propagate exact child exit code
  return typeof result.exitCode === 'number' ? result.exitCode : (result.success ? 0 : 1);
}
