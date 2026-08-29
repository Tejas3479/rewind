import { MissingArgumentError, CliError, UsageError } from '../errors.js';
import { RecoveryStates, assertValidTransition } from '../storage/state.js';
import { formatJson } from '../formatter.js';

/**
 * Handler for `rewind recover <id> [options]`.
 * Records user-provided suspected cause, remediation change, and explicit verification command.
 * Transitions state from OBSERVED/REGRESSED -> SUSPECTED or FIXED.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function recoverCommand({ context }) {
  const { parsedArgs, storage, stdout, stderr, styler } = context;
  const id = parsedArgs.positional[0];

  if (!id) {
    throw new MissingArgumentError('id', 'rewind recover <id> [--cause "..."] [--change "..."] [--verify-cmd "..."]');
  }

  const record = storage.getRecord(id);
  if (!record) {
    throw new CliError(`Incident #${id} not found in ledger.`, { code: 'ERR_NOT_FOUND', exitCode: 1 });
  }

  const cause = parsedArgs.flags.cause;
  const change = parsedArgs.flags.change;
  const verifyCmd = parsedArgs.flags.verifyCmd;

  if (!cause && !change && !verifyCmd) {
    throw new UsageError(
      `Please provide recovery details for Incident #${id} using:\n` +
      `  --cause "<suspected cause>"\n` +
      `  --change "<change made>"\n` +
      `  --verify-cmd "<explicit verification command>"`
    );
  }

  // Determine target trust loop state
  let targetState = RecoveryStates.SUSPECTED;
  if (change || verifyCmd) {
    targetState = RecoveryStates.FIXED;
  }

  // Validate state transition
  assertValidTransition(record.status, targetState, id);

  // Apply atomic record update
  const updated = storage.updateRecord(id, (current) => {
    const newRecoveryEntry = {
      timestamp: new Date().toISOString(),
      ...(cause ? { cause } : {}),
      ...(change ? { change } : {}),
      ...(verifyCmd ? { verifyCmd } : {})
    };

    return {
      ...current,
      status: targetState,
      recoveries: [...(current.recoveries || []), newRecoveryEntry]
    };
  });

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({
      status: 'success',
      data: updated
    }) + '\n');
    return 0;
  }

  const tag = styler.badge('rewind', styler.yellow);
  const idText = styler.bold(`#${id}`);
  const stateColor = targetState === RecoveryStates.FIXED ? styler.green : styler.yellow;

  stdout.write(`${tag} Incident ${idText} transitioned to state: ${stateColor(targetState)}\n`);
  if (cause) stdout.write(`  ${styler.dim('Suspected Cause:')} ${cause}\n`);
  if (change) stdout.write(`  ${styler.dim('Change Made:')}     ${change}\n`);
  if (verifyCmd) stdout.write(`  ${styler.dim('Verify Command:')}  ${styler.cyan(verifyCmd)}\n`);

  if (targetState === RecoveryStates.FIXED && verifyCmd) {
    stdout.write(`\nReady to verify! Run "${styler.cyan(`rewind verify ${id}`)}" to validate and seal this fix.\n`);
  }

  return 0;
}
