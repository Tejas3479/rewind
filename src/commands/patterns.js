import { formatJson, formatRelativeTime } from '../formatter.js';
import { sanitizeForDisplay } from '../sanitizer.js';

/**
 * Handler for `rewind patterns [options]`.
 * Generates deterministic, evidence-backed pattern diagnostics from the authoritative journal.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function patternsCommand({ context }) {
  const { parsedArgs, storage, stdout, styler } = context;
  const s = styler;

  const options = {
    fingerprint: parsedArgs.flags.fingerprint || null,
    limit: parsedArgs.flags.limit || null
  };

  const report = storage.getPatternReport(options);

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({
      status: 'success',
      data: report
    }) + '\n');
    return 0;
  }

  if (report.patternFamiliesCount === 0) {
    if (options.fingerprint) {
      stdout.write(`No pattern evidence found matching fingerprint "${options.fingerprint}".\n`);
    } else {
      stdout.write('No failure patterns detected in ledger. All commands succeeded or ledger is empty.\n');
    }
    return 0;
  }

  const isExplain = Boolean(parsedArgs.flags.explain);

  stdout.write('\n' + s.bold('PATTERN INTELLIGENCE REPORT') + ` (${report.patternFamiliesCount} failure families across ${report.analyzedEvents} journal events)\n`);
  stdout.write(s.dim('────────────────────────────────────────────────────────────────────────\n'));

  for (const family of report.patterns) {
    const badges = family.classifications.length > 0
      ? family.classifications.map((c) => {
        const colorFn = c.type === 'LIKELY_FLAKY'
          ? s.yellow
          : c.type === 'RECURRING_REGRESSION'
            ? s.red
            : c.type === 'FREQUENTLY_VERIFIED_RECOVERY'
              ? s.green
              : s.cyan;
        return colorFn(s.bold(`[${c.type}]`));
      }).join(' ')
      : s.dim('[UNCLASSIFIED]');

    stdout.write(`\n${badges} ${s.bold('Fingerprint:')} ${s.cyan(family.fingerprint)}\n`);
    stdout.write(`  ${s.dim('Summary:')}        ${sanitizeForDisplay(family.summary)}\n`);
    stdout.write(`  ${s.dim('Occurrences:')}    ${s.bold(String(family.totalIncidents))} incident(s)`);
    if (family.firstSeen && family.lastSeen) {
      stdout.write(` (First: ${formatRelativeTime(family.firstSeen)}, Last: ${formatRelativeTime(family.lastSeen)})`);
    }
    stdout.write('\n');
    stdout.write(`  ${s.dim('Incident IDs:')}   ${family.incidents.map((id) => `#${id}`).join(', ')}\n`);

    if (family.classifications.length > 0) {
      stdout.write(`  ${s.dim('Diagnostics:')}\n`);
      for (const c of family.classifications) {
        const strengthLabel = c.strength === 'STRONG' ? s.green(`(${c.strength})`) : s.dim(`(${c.strength})`);
        stdout.write(`    • ${s.bold(c.type)} ${strengthLabel}: ${c.summary}\n`);
      }
    }

    if (isExplain && family.explanations.length > 0) {
      stdout.write(`\n  ${s.bold('Evidence Explanations & Reasoning (--explain):')}\n`);
      for (const exp of family.explanations) {
        stdout.write(`    ┌─ ${s.bold(exp.title)}\n`);
        stdout.write(`    │  ${s.dim('Rule:')}       ${exp.rule}\n`);
        stdout.write(`    │  ${s.dim('Observed:')}   ${exp.observed}\n`);
        stdout.write(`    │  ${s.dim('Conclusion:')} ${exp.conclusion}\n`);
        stdout.write(`    │  ${s.dim('Causality:')}  ${s.dim(exp.causality)}\n`);
        stdout.write(`    └─────────────────────────────────────────────────────\n`);
      }
    }

    stdout.write(s.dim('────────────────────────────────────────────────────────────────────────\n'));
  }

  stdout.write(`\n${s.dim('Note: Patterns represent empirical observations in historical evidence. Causality is never automatically inferred.')}\n\n`);

  return 0;
}
