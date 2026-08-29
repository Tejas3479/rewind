import { MissingArgumentError } from '../errors.js';
import { executeAndCapture } from '../capture.js';
import { formatJson } from '../formatter.js';
import { RecoveryStates } from '../storage/state.js';

/**
 * Handler for `rewind run <command...>`.
 * Executes the user-requested process, streams output live, captures all diagnostic
 * lifecycle evidence, persists failure records into local storage, detects regressions,
 * and strictly propagates the child process's exit code.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>} - Child process exit code
 */
export async function runCommand({ context }) {
  const { parsedArgs, config, storage, env, stdout, stderr, styler } = context;
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

  let savedRecord = null;
  // Automatically persist failure records in local ledger
  if (!result.success && storage) {
    savedRecord = storage.saveRecord(result);

    if (!isJsonMode && stderr && typeof stderr.write === 'function') {
      const tag = styler.badge('rewind', styler.yellow);
      const idText = styler.bold(`#${savedRecord.id}`);

      if (savedRecord.status === RecoveryStates.REGRESSED && savedRecord.regressionOf) {
        const prior = storage.getRecord(savedRecord.regressionOf);
        const lastRecovery = prior?.recoveries?.[prior.recoveries.length - 1];

        stderr.write(`\n${styler.red(styler.bold('[rewind:REGRESSION]'))} Failure matches previously ${styler.green('VERIFIED')} Incident #${savedRecord.regressionOf}!\n`);
        if (lastRecovery) {
          if (lastRecovery.cause) stderr.write(`  ${styler.dim('Suspected Cause:')} ${lastRecovery.cause}\n`);
          if (lastRecovery.change) stderr.write(`  ${styler.dim('Verified Fix:')}    ${lastRecovery.change}\n`);
          if (lastRecovery.verifyCmd) stderr.write(`  ${styler.dim('Verify Command:')}  ${styler.cyan(lastRecovery.verifyCmd)}\n`);
        }
        stderr.write(`Recorded new occurrence as Incident ${idText} (Status: ${styler.red('REGRESSED')}). Run "${styler.cyan(`rewind show ${savedRecord.id}`)}".\n\n`);
      } else {
        stderr.write(`\n${tag} Recorded failure as incident ${idText}. Run "${styler.cyan(`rewind show ${savedRecord.id}`)}" to inspect.\n`);
      }
    }
  }

  if (isJsonMode) {
    stdout.write(formatJson({
      status: result.success ? 'success' : 'failure',
      incidentId: savedRecord ? savedRecord.id : null,
      data: savedRecord || result
    }) + '\n');
  }

  // Propagate exact child exit code
  return typeof result.exitCode === 'number' ? result.exitCode : (result.success ? 0 : 1);
}
