import { MissingArgumentError, CliError, UsageError } from '../errors.js';
import { RecoveryStates, assertValidTransition } from '../storage/state.js';
import { formatJson, formatStatusBadge } from '../formatter.js';
import { sanitizeForDisplay } from '../sanitizer.js';

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
  const { parsedArgs, storage, stdout, styler } = context;
  const id = parsedArgs.positional[0];

  if (!id) {
    throw new MissingArgumentError('id', 'rewind recover <id> [--cause "..."] [--change "..."] [--verify-cmd "..."]');
  }

  const record = storage.getRecord(id);
  if (!record) {
    throw new CliError(`Incident #${id} not found in ledger.`, {
      code: 'ERR_NOT_FOUND',
      exitCode: 1,
      details: { id, suggestion: 'Run "rewind history" to browse all past incidents.' }
    });
  }

  const cause = parsedArgs.flags.cause;
  const change = parsedArgs.flags.change;
  const verifyCmd = parsedArgs.flags.verifyCmd;

  if (!cause && !change && !verifyCmd) {
    throw new UsageError(
      `Please provide recovery details for Incident #${id} using:\n` +
      `  --cause "<suspected cause>"\n` +
      `  --change "<remediation change made>"\n` +
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

  const s = styler;
  const divider = s.dim('─'.repeat(60));

  stdout.write(`\n${s.bold('RECOVERY RECORDED')}  ${s.dim(`[Incident #${id}]`)}\n`);
  stdout.write(`${divider}\n`);
  stdout.write(`  ${s.dim('New State:'.padEnd(18))} ${formatStatusBadge(targetState, s)}\n`);
  if (cause) stdout.write(`  ${s.dim('Suspected Cause:'.padEnd(18))} ${sanitizeForDisplay(cause)}\n`);
  if (change) stdout.write(`  ${s.dim('Attempted Fix:'.padEnd(18))}   ${sanitizeForDisplay(change)}\n`);
  if (verifyCmd) stdout.write(`  ${s.dim('Verify Command:'.padEnd(18))}  ${s.cyan(sanitizeForDisplay(verifyCmd))}\n`);
  stdout.write(`${divider}\n`);

  if (targetState === RecoveryStates.FIXED && verifyCmd) {
    stdout.write(`\nNext Step:\n  Run "${s.cyan(`rewind verify ${id}`)}" to execute the verification command and seal this recovery.\n\n`);
  } else if (targetState === RecoveryStates.SUSPECTED) {
    stdout.write(`\nNext Step:\n  Record the change made and verification command with "${s.cyan(`rewind recover ${id} --change "..." --verify-cmd "..."`)}".\n\n`);
  } else {
    stdout.write('\n');
  }

  return 0;
}
