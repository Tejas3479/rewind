import { MissingArgumentError, CliError } from '../errors.js';
import { formatJson, formatStatusBadge } from '../formatter.js';
import { sanitizeForDisplay } from '../sanitizer.js';
import { normalizeId } from '../storage/store.js';
import { formatNegativeMemorySection } from '../storage/negative_memory.js';
import { formatContradictionSection } from '../storage/contradiction.js';

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
 * Displays complete inspectable forensic record with full attempt history,
 * verification runs, negative memory, staleness analysis, and contradiction alerts.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function showCommand({ context }) {
  const { parsedArgs, storage, stdout, styler } = context;
  const rawId = parsedArgs.positional[0];

  if (!rawId) {
    throw new MissingArgumentError('id', 'rewind show <id> [--json]');
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

  const stalenessReport = storage.getStalenessReport(id);
  const failedApproaches = storage.getNegativeMemory(record.fingerprint);
  const conflictReport = storage.getContradictionReport(record.fingerprint);

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({
      status: 'success',
      data: record,
      intelligence: {
        staleness: stalenessReport,
        negativeMemory: failedApproaches,
        conflicts: conflictReport
      }
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
  stdout.write(`  ${s.dim('Command:')}      ${s.cyan(sanitizeForDisplay(record.fullCommand || `${record.command} ${(record.args || []).join(' ')}`))}\n`);
  stdout.write(`  ${s.dim('Exit Code:')}    ${record.exitCode !== null ? s.bold(String(record.exitCode)) : s.dim('null')}${record.signal ? ` (Signal: ${record.signal})` : ''}\n`);
  stdout.write(`  ${s.dim('Duration:')}     ${record.durationMs}ms\n`);
  stdout.write(`  ${s.dim('Started At:')}   ${formatUtc(record.startTime)}\n`);
  stdout.write(`  ${s.dim('Working Dir:')}  ${record.cwd}\n`);
  if (record.regressionOf) {
    stdout.write(`  ${s.dim('Regression Of:')} ${s.red(s.bold(`Incident #${record.regressionOf}`))}\n`);
  }
  if (record.evidenceHash) {
    stdout.write(`  ${s.dim('Evidence Hash:')} ${s.dim(record.evidenceHash.slice(0, 16))}...\n`);
  }
  stdout.write('\n');

  // Section 2: Failure Signature & Fingerprint
  stdout.write(`${s.bold('FAILURE SIGNATURE:')}\n`);
  stdout.write(`  ${s.dim('Fingerprint:'.padEnd(14))} ${s.cyan(record.fingerprint || 'none')}\n`);
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
    stdout.write(`  ${s.dim('Git Branch:'.padEnd(14))} ${record.git.branch || s.dim('detached')} (${record.git.headCommit ? record.git.headCommit.slice(0, 10) : 'none'})\n`);
  }
  if (record.environment) {
    stdout.write(`  ${s.dim('Platform:'.padEnd(14))} ${record.environment.platform} (${record.environment.arch}) / OS ${record.environment.osRelease}\n`);
    stdout.write(`  ${s.dim('Runtime:'.padEnd(14))} Node.js ${record.environment.nodeVersion}\n`);
    if (record.environment.envKeysHash) {
      stdout.write(`  ${s.dim('Env Keys Hash:'.padEnd(14))} ${s.dim(record.environment.envKeysHash)}\n`);
    }
  }
  stdout.write('\n');

  // Section 5: Recovery History & Verification Runs
  const attempts = Array.isArray(record.recoveryAttempts) ? record.recoveryAttempts : [];
  if (attempts.length > 0) {
    stdout.write(`${s.bold(`RECOVERY ATTEMPTS (${attempts.length} recorded):`)}\n`);
    for (const att of attempts) {
      const attBadge = formatStatusBadge(att.status, s);
      stdout.write(`  ${s.bold(`[Attempt #${att.id}]`)} ${attBadge} ${s.dim(`(${formatUtc(att.createdAt)})`)}\n`);
      if (att.cause) stdout.write(`    ${s.dim('Hypothesis:'.padEnd(16))} ${sanitizeForDisplay(att.cause)}\n`);
      if (att.change) stdout.write(`    ${s.dim('Attempted Fix:'.padEnd(16))} ${sanitizeForDisplay(att.change)}\n`);
      if (att.verifyCmd) stdout.write(`    ${s.dim('Verify Command:'.padEnd(16))} ${s.cyan(sanitizeForDisplay(att.verifyCmd))}\n`);

      const runs = Array.isArray(att.verificationRuns) ? att.verificationRuns : [];
      if (runs.length > 0) {
        stdout.write(`    ${s.dim('Verification Runs:')}\n`);
        for (const run of runs) {
          const runBadge = run.result === 'PASSED' ? s.green('✓ PASSED (Exit 0)') : s.red(`✗ FAILED (Exit ${run.exitCode})`);
          stdout.write(`      • ${runBadge} ${s.dim(`(${run.durationMs}ms at ${formatUtc(run.completedAt)})`)}\n`);
        }
      }
      stdout.write('\n');
    }
  }

  // Section 6: Known Failed Approaches (Negative Memory)
  if (failedApproaches.length > 0) {
    stdout.write(`${formatNegativeMemorySection(failedApproaches, s)}\n`);
  }

  // Section 7: Environment Staleness Analysis
  if (stalenessReport && (record.status === 'RECOVERED' || record.status === 'VERIFIED')) {
    if (stalenessReport.isStale) {
      stdout.write(`${s.bold(s.yellow('ENVIRONMENT STALENESS ANALYSIS:'))}\n`);
      stdout.write(`  ${s.yellow('[STALE EVIDENCE]')} The environment has diverged since this recovery was verified:\n`);
      for (const reason of stalenessReport.reasons) {
        stdout.write(`    • ${s.dim(reason)}\n`);
      }
      stdout.write('\n');
    } else {
      stdout.write(`${s.bold(s.green('ENVIRONMENT COMPATIBILITY:'))}\n`);
      stdout.write(`  ${s.green('✔ Compatible')} Current runtime environment matches verified recovery conditions.\n\n`);
    }
  }

  // Section 8: Evidence Conflicts & Contradictions
  if (conflictReport && conflictReport.hasConflicts) {
    stdout.write(`${formatContradictionSection(conflictReport, s)}\n`);
  }

  stdout.write(`${divider}\n\n`);
  return 0;
}

