import { formatJson } from '../formatter.js';

/**
 * Handler for `rewind verify-integrity [--json]`.
 * Performs a strictly read-only, four-layer integrity audit across the authoritative
 * event journal, cryptographic hash chain, trusted checkpoint anchor, and derived projections.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>} - 0 if trusted, 1 if untrusted
 */
export async function verifyIntegrityCommand({ context }) {
  const { parsedArgs, storage, stdout, stderr, styler } = context;
  const isJsonMode = Boolean(parsedArgs.flags.json);

  const report = storage.verifyIntegrity();

  if (isJsonMode) {
    stdout.write(formatJson({
      status: report.status,
      isTrusted: report.isTrusted,
      report
    }) + '\n');
    return report.isTrusted ? 0 : 1;
  }

  const s = styler;
  const termWidth = (stdout && typeof stdout.columns === 'number' && stdout.columns > 20)
    ? Math.min(stdout.columns, 80)
    : 72;
  const divider = s.dim('─'.repeat(termWidth));

  if (report.status === 'TRUSTED') {
    const title = s.bold('JOURNAL INTEGRITY AUDIT');
    stdout.write(`\n${title}\n`);
    stdout.write(`${divider}\n`);
    stdout.write(`  ${s.dim('Events Examined:'.padEnd(24))} ${s.bold(String(report.journal.examined))}\n`);
    stdout.write(`  ${s.dim('Valid Events:'.padEnd(24))} ${s.green(String(report.journal.valid))}\n`);
    stdout.write(`  ${s.dim('Chain Continuity:'.padEnd(24))} ${s.green('✔ INTACT (SHA-256)')}\n`);
    stdout.write(`  ${s.dim('Trusted Checkpoint:'.padEnd(24))} ${report.checkpoint.present ? s.green(`✔ MATCHES HEAD (#${report.checkpoint.headSequence})`) : s.yellow('MISSING')}\n`);
    stdout.write(`  ${s.dim('Derived Projections:'.padEnd(24))} ${s.green(`✔ CONSISTENT (${report.projections.consistent} incidents)`)}\n`);
    if (report.quarantine.count > 0) {
      stdout.write(`  ${s.dim('Quarantined Files:'.padEnd(24))} ${s.yellow(`${report.quarantine.count} isolated artifact(s)`)}\n`);
    } else {
      stdout.write(`  ${s.dim('Quarantined Files:'.padEnd(24))} 0\n`);
    }
    stdout.write(`${divider}\n`);
    stdout.write(`  ${s.bold('RESULT:')} ${s.green(s.bold('TRUSTED'))} ${s.dim('(Local Tamper Evidence Intact)')}\n\n`);
    return 0;
  }

  if (report.status === 'CRASH_RECOVERY_PENDING') {
    const title = s.yellow(s.bold('CRASH RECOVERY PENDING (Expected Lag)'));
    stdout.write(`\n${title}\n`);
    stdout.write(`${divider}\n`);
    stdout.write(`  ${s.dim('Events Examined:'.padEnd(24))} ${s.bold(String(report.journal.examined))}\n`);
    stdout.write(`  ${s.dim('Chain Continuity:'.padEnd(24))} ${s.green('✔ INTACT')}\n`);
    stdout.write(`  ${s.dim('Trusted Checkpoint:'.padEnd(24))} ${s.yellow('LAGGING (Journal has uncommitted crash extension)')}\n`);
    stdout.write(`  ${s.dim('Resolution:'.padEnd(24))} Start any rewind command to automatically fast-forward checkpoint.\n`);
    stdout.write(`${divider}\n`);
    stdout.write(`  ${s.bold('RESULT:')} ${s.yellow(s.bold('RECOVERY PENDING'))} ${s.dim('(Authoritative Journal is Intact)')}\n\n`);
    return 0;
  }

  // Integrity Failure
  const title = s.red(s.bold('INTEGRITY FAILURE (Tampering or Corruption Detected)'));
  stderr.write(`\n${title}\n`);
  stderr.write(`${divider}\n`);
  stderr.write(`  ${s.dim('Events Examined:'.padEnd(24))} ${s.bold(String(report.journal.examined))}\n`);
  stderr.write(`  ${s.dim('Valid Events:'.padEnd(24))} ${report.journal.valid}\n`);
  if (report.journal.malformedCount > 0) {
    stderr.write(`  ${s.dim('Malformed Lines:'.padEnd(24))} ${s.red(String(report.journal.malformedCount))}\n`);
  }
  stderr.write(`  ${s.dim('Chain Continuity:'.padEnd(24))} ${report.journal.chainIntact ? s.green('✔ INTACT') : s.red('✗ BROKEN')}\n`);
  stderr.write(`  ${s.dim('Trusted Checkpoint:'.padEnd(24))} ${report.checkpoint.matches ? s.green('✔ MATCHES') : s.red('✗ MISMATCH / TAMPERED')}\n`);
  stderr.write(`  ${s.dim('Derived Projections:'.padEnd(24))} ${report.projections.driftCount === 0 ? s.green('✔ CONSISTENT') : s.red(`✗ ${report.projections.driftCount} DRIFT(S) DETECTED`)}\n`);

  if (report.errors.length > 0) {
    stderr.write(`${divider}\n`);
    stderr.write(`  ${s.bold('Violation Details:')}\n`);
    for (const err of report.errors.slice(0, 8)) {
      const seqTag = err.sequence ? ` [Seq #${err.sequence}]` : '';
      stderr.write(`    ${s.red('•')} ${s.bold(err.type)}${seqTag}: ${err.message}\n`);
    }
    if (report.errors.length > 8) {
      stderr.write(`    ${s.dim(`... and ${report.errors.length - 8} more violation(s)`)}\n`);
    }
  }

  stderr.write(`${divider}\n`);
  stderr.write(`  ${s.bold('RESULT:')} ${s.red(s.bold('UNTRUSTED'))} ${s.dim('(History has been modified or corrupted)')}\n\n`);
  return 1;
}
