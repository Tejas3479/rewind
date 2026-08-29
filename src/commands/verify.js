import { MissingArgumentError, CliError, UsageError } from '../errors.js';
import { RecoveryStates, assertValidTransition } from '../storage/state.js';
import { executeAndCapture } from '../capture.js';
import { tokenizeCommandLine } from '../parser.js';
import { formatJson } from '../formatter.js';

/**
 * Handler for `rewind verify <id>`.
 * Loads the selected recovery record, displays and executes ONLY the explicitly stored
 * verification command, and updates the trust loop state to VERIFIED upon success.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>} - 0 if verified, non-zero if verification command failed
 */
export async function verifyCommand({ context }) {
  const { parsedArgs, config, storage, env, stdout, stderr, styler } = context;
  const id = parsedArgs.positional[0];

  if (!id) {
    throw new MissingArgumentError('id', 'rewind verify <id>');
  }

  const record = storage.getRecord(id);
  if (!record) {
    throw new CliError(`Incident #${id} not found in ledger.`, { code: 'ERR_NOT_FOUND', exitCode: 1 });
  }

  if (record.status === RecoveryStates.VERIFIED) {
    throw new UsageError(`Incident #${id} is already in state VERIFIED.`);
  }

  // Find the latest recorded verification command
  let verifyCmd = null;
  if (Array.isArray(record.recoveries)) {
    for (let i = record.recoveries.length - 1; i >= 0; i--) {
      if (record.recoveries[i].verifyCmd) {
        verifyCmd = record.recoveries[i].verifyCmd;
        break;
      }
    }
  }

  if (!verifyCmd) {
    throw new UsageError(
      `Incident #${id} has no explicit verification command recorded.\n` +
      `Run "rewind recover ${id} --verify-cmd \\"<command>\\"" before verifying.`
    );
  }

  const isJsonMode = Boolean(parsedArgs.flags.json);

  if (!isJsonMode) {
    const tag = styler.badge('rewind:verify', styler.cyan);
    stdout.write(`\n${tag} Executing user-approved verification command for Incident #${id}:\n`);
    stdout.write(`  ${styler.bold(styler.cyan('$ ' + verifyCmd))}\n\n`);
  }

  // Execute ONLY the explicitly stored verification command
  const stdoutStream = isJsonMode ? null : stdout;
  const stderrStream = isJsonMode ? null : stderr;
  const commandTokens = tokenizeCommandLine(verifyCmd);

  const verifyResult = await executeAndCapture(commandTokens, {
    cwd: config.rootDir,
    env,
    stdoutStream,
    stderrStream
  });

  if (verifyResult.success) {
    // Assert and transition state to VERIFIED
    assertValidTransition(record.status, RecoveryStates.VERIFIED, id);

    const updated = storage.updateRecord(id, (current) => ({
      ...current,
      status: RecoveryStates.VERIFIED,
      verification: {
        verifiedAt: new Date().toISOString(),
        command: verifyCmd,
        exitCode: 0,
        durationMs: verifyResult.durationMs,
        output: verifyResult.stdout || verifyResult.stderr
      }
    }));

    if (isJsonMode) {
      stdout.write(formatJson({
        status: 'success',
        verified: true,
        data: updated
      }) + '\n');
      return 0;
    }

    const tag = styler.badge('rewind', styler.green);
    stdout.write(`\n${tag} ${styler.bold(styler.green('VERIFIED!'))} Incident #${id} successfully validated under recorded conditions.\n`);
    stdout.write(`The verified recovery has been sealed into the ledger.\n`);
    return 0;
  } else {
    // Record failed verification attempt without promoting state
    const updated = storage.updateRecord(id, (current) => ({
      ...current,
      verification: {
        lastAttemptAt: new Date().toISOString(),
        command: verifyCmd,
        exitCode: verifyResult.exitCode,
        durationMs: verifyResult.durationMs,
        output: verifyResult.stderr || verifyResult.stdout,
        passed: false
      }
    }));

    if (isJsonMode) {
      stdout.write(formatJson({
        status: 'failure',
        verified: false,
        data: updated
      }) + '\n');
      return verifyResult.exitCode || 1;
    }

    const tag = styler.badge('rewind', styler.red);
    stderr.write(`\n${tag} ${styler.bold(styler.red('NOT VERIFIED:'))} Verification command failed with exit code ${verifyResult.exitCode}.\n`);
    return verifyResult.exitCode || 1;
  }
}
