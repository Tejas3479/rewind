import { MissingArgumentError, CliError, UsageError } from '../errors.js';
import { IncidentStatus, RecoveryAttemptStatus, assertValidIncidentTransition } from '../storage/state.js';
import { formatJson, formatStatusBadge } from '../formatter.js';
import { sanitizeForDisplay } from '../sanitizer.js';
import { normalizeId } from '../storage/store.js';

/**
 * Handler for `rewind recover <id> [options]`.
 * Records user-provided suspected cause, remediation change, and explicit verification command
 * as a new RecoveryAttempt without overwriting historical failed attempts.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function recoverCommand({ context }) {
  const { parsedArgs, storage, stdout, styler } = context;
  const rawId = parsedArgs.positional[0];

  if (!rawId) {
    throw new MissingArgumentError('id', 'rewind recover <id> [--cause "..."] [--change "..."] [--verify-cmd "..."]');
  }

  const id = normalizeId(rawId);
  const record = storage.getRecord(id);
  if (!record) {
    throw new CliError(`Incident #${rawId} not found in ledger.`, {
      code: 'ERR_NOT_FOUND',
      exitCode: 1,
      details: { id: rawId, suggestion: 'Run "rewind history" to browse all past incidents.' }
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

  // Validate incident state transition
  assertValidIncidentTransition(record.status, IncidentStatus.OPEN, id);

  // Append new recovery attempt
  const updated = storage.addRecoveryAttempt(id, {
    cause,
    change,
    verifyCmd
  });

  const latestAttempt = updated.recoveryAttempts[updated.recoveryAttempts.length - 1];
  const isComplete = Boolean(verifyCmd);

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({
      status: 'success',
      incidentStatus: updated.status,
      attempt: latestAttempt,
      data: updated
    }) + '\n');
    return 0;
  }

  const s = styler;
  const termWidth = (stdout && typeof stdout.columns === 'number' && stdout.columns > 20)
    ? Math.min(stdout.columns, 80)
    : 64;
  const divider = s.dim('─'.repeat(termWidth));

  stdout.write(`\n${s.bold('RECOVERY RECORDED')}  ${s.dim(`[Incident #${id}, Attempt #${latestAttempt.id}]`)}\n`);
  stdout.write(`${divider}\n`);
  stdout.write(`  ${s.dim('Incident Status:'.padEnd(20))} ${formatStatusBadge(updated.status, s)}\n`);
  stdout.write(`  ${s.dim('Attempt Status:'.padEnd(20))} ${formatStatusBadge(latestAttempt.status, s)}\n`);
  if (cause) stdout.write(`  ${s.dim('Suspected Cause:'.padEnd(20))} ${sanitizeForDisplay(cause)}\n`);
  if (change) stdout.write(`  ${s.dim('Attempted Fix:'.padEnd(20))} ${sanitizeForDisplay(change)}\n`);
  if (verifyCmd) {
    stdout.write(`  ${s.dim('Verify Command:'.padEnd(20))} ${s.cyan(sanitizeForDisplay(verifyCmd))}\n`);
  } else {
    stdout.write(`  ${s.dim('Verification Plan:'.padEnd(20))} ${s.yellow('[INCOMPLETE RECOVERY RECORD — Missing --verify-cmd]')}\n`);
  }
  stdout.write(`${divider}\n`);

  // Show previous failed attempts count if any
  const priorFailedAttempts = updated.recoveryAttempts.filter(a => a.id !== latestAttempt.id && a.status === 'FAILED');
  if (priorFailedAttempts.length > 0) {
    stdout.write(`\n${s.dim(`Note: Incident #${id} has ${priorFailedAttempts.length} prior failed attempt(s) preserved in negative memory.`)}\n`);
  }

  if (verifyCmd) {
    stdout.write(`\nNext Step:\n  Run "${s.cyan(`rewind verify ${id}`)}" to execute the verification command and seal this recovery.\n\n`);
  } else {
    stdout.write(`\nNext Step:\n  Record the explicit verification command with "${s.cyan(`rewind recover ${id} --verify-cmd "<command>"`)}".\n\n`);
  }

  return 0;
}

