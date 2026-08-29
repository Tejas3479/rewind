import { MissingArgumentError, CliError } from '../errors.js';
import { formatJson, formatStatusBadge } from '../formatter.js';
import { RecoveryStates } from '../storage/state.js';
import { sanitizeForDisplay } from '../sanitizer.js';

/**
 * Formats full UTC timestamp.
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatUtc(isoString) {
  if (!isoString) return 'unknown';
  try {
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  } catch {
    return isoString;
  }
}

/**
 * Handler for `rewind show <id> [options]`.
 * Displays complete inspectable forensic record with clear visual hierarchy.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function showCommand({ context }) {
  const { parsedArgs, storage, stdout, styler } = context;
  const id = parsedArgs.positional[0];

  if (!id) {
    throw new MissingArgumentError('id', 'rewind show <id> [--json]');
  }

  const record = storage.getRecord(id);
  if (!record) {
    throw new CliError(`Incident #${id} not found in ledger.`, {
      code: 'ERR_NOT_FOUND',
      exitCode: 1,
      details: { id, suggestion: 'Run "rewind history" to browse all past incidents.' }
    });
  }

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({
      status: 'success',
      data: record
    }) + '\n');
    return 0;
  }

  const s = styler;
  const termWidth = (stdout && typeof stdout.columns === 'number' && stdout.columns > 20)
    ? Math.min(stdout.columns, 80)
    : 80;
  const divider = s.dim('─'.repeat(termWidth));

  stdout.write(`\n${s.bold(`INCIDENT #${record.id}`)}  ${formatStatusBadge(record.status, s)}\n`);
  stdout.write(`${divider}\n`);

  // Section 1: Execution Details
  stdout.write(`${s.bold('EXECUTION:')}\n`);
  stdout.write(`  ${s.dim('Command:')}      ${s.cyan(record.fullCommand || `${record.command} ${(record.args || []).join(' ')}`)}\n`);
  stdout.write(`  ${s.dim('Exit Code:')}    ${record.exitCode !== null ? s.bold(String(record.exitCode)) : s.dim('null')}${record.signal ? ` (Signal: ${record.signal})` : ''}\n`);
  stdout.write(`  ${s.dim('Duration:')}     ${record.durationMs}ms\n`);
  stdout.write(`  ${s.dim('Started At:')}   ${formatUtc(record.startTime)}\n`);
  stdout.write(`  ${s.dim('Working Dir:')}  ${record.cwd}\n`);
  if (record.regressionOf) {
    stdout.write(`  ${s.dim('Regression Of:')} ${s.red(s.bold(`Incident #${record.regressionOf}`))}\n`);
  }
  stdout.write('\n');

  // Section 2: Failure Memory & Fingerprint
  stdout.write(`${s.bold('FAILURE MEMORY:')}\n`);
  stdout.write(`  ${s.dim('Fingerprint:')}   ${s.cyan(record.fingerprint || 'none')}\n`);
  if (record.normalizedError) {
    stdout.write(`  ${s.dim('Normalized Signature:')}\n`);
    const cleanNorm = sanitizeForDisplay(record.normalizedError);
    const normLines = cleanNorm.split('\n').map((l) => `    ${s.yellow(l)}`).join('\n');
    stdout.write(`${normLines}\n`);
  }
  stdout.write('\n');

  // Section 3: Captured Stderr & Stdout Evidence
  if (record.stderr && record.stderr.trim()) {
    stdout.write(`${s.bold('CAPTURED STDERR:')}\n`);
    const cleanStderr = sanitizeForDisplay(record.stderr);
    const errLines = cleanStderr.split('\n').map((l) => `  ${l}`).join('\n');
    stdout.write(`${errLines}\n\n`);
  }

  if (record.stdout && record.stdout.trim()) {
    stdout.write(`${s.bold('CAPTURED STDOUT:')}\n`);
    const cleanStdout = sanitizeForDisplay(record.stdout);
    const outLines = cleanStdout.split('\n').map((l) => `  ${l}`).join('\n');
    stdout.write(`${outLines}\n\n`);
  }

  // Section 4: Environment & Repository Metadata
  stdout.write(`${s.bold('ENVIRONMENT & REPOSITORY:')}\n`);
  if (record.git && record.git.isGit) {
    stdout.write(`  ${s.dim('Git Branch:')}   ${record.git.branch || s.dim('detached')} (${record.git.headCommit ? record.git.headCommit.slice(0, 10) : 'none'})\n`);
  }
  if (record.environment) {
    stdout.write(`  ${s.dim('Platform:')}     ${record.environment.platform} (${record.environment.arch}) / OS ${record.environment.osRelease}\n`);
    stdout.write(`  ${s.dim('Runtime:')}      Node.js ${record.environment.nodeVersion}\n`);
  }
  stdout.write('\n');

  // Section 5: Recovery History
  if (Array.isArray(record.recoveries) && record.recoveries.length > 0) {
    stdout.write(`${s.bold('RECOVERY ATTEMPTS:')}\n`);
    for (let i = 0; i < record.recoveries.length; i++) {
      const rec = record.recoveries[i];
      stdout.write(`  ${s.bold(`[Attempt #${i + 1}]`)} ${s.dim(`(${formatUtc(rec.timestamp)})`)}\n`);
      if (rec.cause) stdout.write(`    ${s.dim('Cause:')}   ${sanitizeForDisplay(rec.cause)}\n`);
      if (rec.change) stdout.write(`    ${s.dim('Change:')}  ${sanitizeForDisplay(rec.change)}\n`);
      if (rec.verifyCmd) stdout.write(`    ${s.dim('Verify:')}  ${s.cyan(sanitizeForDisplay(rec.verifyCmd))}\n`);
    }
    stdout.write('\n');
  }

  // Section 6: Verification Record
  if (record.verification) {
    stdout.write(`${s.bold('VERIFICATION RECORD:')}\n`);
    const verStatus = record.status === RecoveryStates.VERIFIED
      ? s.green(s.bold('VERIFIED'))
      : s.red(s.bold('FAILED'));
    stdout.write(`  ${s.dim('Status:')}       ${verStatus}\n`);
    stdout.write(`  ${s.dim('Command:')}      ${s.cyan(sanitizeForDisplay(record.verification.command))}\n`);
    stdout.write(`  ${s.dim('Exit Code:')}    ${record.verification.exitCode}\n`);
    if (record.verification.verifiedAt) {
      stdout.write(`  ${s.dim('Verified At:')}  ${formatUtc(record.verification.verifiedAt)}\n`);
    }
    stdout.write('\n');
  }

  stdout.write(`${divider}\n\n`);
  return 0;
}
