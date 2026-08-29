import { MissingArgumentError } from '../errors.js';
import { executeAndCapture } from '../capture.js';
import { formatJson } from '../formatter.js';
import { RecoveryStates } from '../storage/state.js';
import { sanitizeForDisplay } from '../sanitizer.js';

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
      const s = styler;
      const idText = s.bold(`#${savedRecord.id}`);

      if (savedRecord.status === RecoveryStates.REGRESSED && savedRecord.regressionOf) {
        const prior = storage.getRecord(savedRecord.regressionOf);
        const lastRecovery = prior?.recoveries?.[prior.recoveries.length - 1];

        const alertTitle = s.red(s.bold('[rewind:REGRESSION]'));
        stderr.write(`\n${alertTitle} Failure matches previously ${s.green('VERIFIED')} Incident #${savedRecord.regressionOf}!\n\n`);

        if (lastRecovery) {
          stderr.write(`${s.bold('Historical Recovery:')}\n`);
          if (lastRecovery.cause) stderr.write(`  ${s.dim('Suspected Cause:'.padEnd(18))} ${sanitizeForDisplay(lastRecovery.cause)}\n`);
          if (lastRecovery.change) stderr.write(`  ${s.dim('Verified Fix:'.padEnd(18))} ${sanitizeForDisplay(lastRecovery.change)}\n`);
          if (lastRecovery.verifyCmd) stderr.write(`  ${s.dim('Verify Command:'.padEnd(18))} ${s.cyan(sanitizeForDisplay(lastRecovery.verifyCmd))}\n`);
          stderr.write('\n');
        }

        stderr.write(`Recorded new occurrence as Incident ${idText} (Status: ${s.red('REGRESSED')}). Run "${s.cyan(`rewind show ${savedRecord.id}`)}".\n`);
        stderr.write(`${s.dim('Important: Historical recovery is evidence, not an automatic fix. Rewind never automatically replays past commands.')}\n\n`);
      } else {
        const tag = s.badge('rewind', s.yellow);
        stderr.write(`\n${tag} Recorded failure as incident ${idText}. Run "${s.cyan(`rewind show ${savedRecord.id}`)}" to inspect.\n\n`);
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
