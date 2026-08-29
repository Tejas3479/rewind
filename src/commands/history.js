import { formatJson, formatRelativeTime, formatStatusBadge } from '../formatter.js';
import { RecoveryStates } from '../storage/state.js';

/**
 * Derives a concise result summary for an incident row.
 *
 * @param {import('../storage/record.js').FailureRecord} rec
 * @param {import('../formatter.js').createStyler} s
 * @returns {string}
 */
function getResultSummary(rec, s) {
  if (rec.status === RecoveryStates.VERIFIED) {
    return s.green('verified fix');
  }
  if (rec.status === RecoveryStates.REGRESSED) {
    return rec.regressionOf ? s.red(`matches #${rec.regressionOf}`) : s.red('regressed');
  }
  if (rec.status === RecoveryStates.FIXED) {
    return s.cyan('fix recorded');
  }
  if (rec.status === RecoveryStates.SUSPECTED) {
    return s.yellow('suspected');
  }
  if (rec.exitCode !== null && rec.exitCode !== undefined) {
    return s.dim(`exit ${rec.exitCode}`);
  }
  return s.dim('failed');
}

/**
 * Handler for `rewind history [options]`.
 * Lists historical failure incidents sorted newest first, with support for --limit and --json.
 * Uses adaptive column layout based on terminal width without external packages.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function historyCommand({ context }) {
  const { parsedArgs, storage, stdout, styler } = context;

  const allRecords = storage.listRecords();
  // Sort newest first (highest ID first)
  const sorted = [...allRecords].reverse();

  const limit = parsedArgs.flags.limit;
  const records = limit ? sorted.slice(0, limit) : sorted;

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({
      status: 'success',
      total: allRecords.length,
      count: records.length,
      data: records
    }) + '\n');
    return 0;
  }

  const s = styler;

  if (records.length === 0) {
    const tag = s.badge('rewind', s.yellow);
    stdout.write(`\n${tag} No recorded incidents in ledger.\n`);
    stdout.write(`Run "${s.cyan('rewind run <command...>')}" to start capturing failures.\n\n`);
    return 0;
  }

  const termWidth = (stdout && typeof stdout.columns === 'number' && stdout.columns > 20)
    ? stdout.columns
    : 80;

  // Fixed column widths
  const colIdWidth = 6;
  const colStatusWidth = 12;
  const colTimeWidth = 11;
  const colResultWidth = 14;
  const spacing = 4 * 2; // 4 gutters of 2 spaces
  const fixedWidth = colIdWidth + colStatusWidth + colTimeWidth + colResultWidth + spacing;
  const colCmdWidth = Math.max(20, Math.min(60, termWidth - fixedWidth));

  const dividerLen = Math.min(termWidth, fixedWidth + colCmdWidth);
  const divider = s.dim('─'.repeat(dividerLen));

  stdout.write(`\n${s.bold('REWIND RECOVERY LEDGER')} ${s.dim(`(${allRecords.length} total incidents)`)}\n`);
  stdout.write(`${divider}\n`);

  // Header
  const hId = 'ID'.padEnd(colIdWidth);
  const hStatus = 'STATUS'.padEnd(colStatusWidth);
  const hCmd = 'COMMAND'.padEnd(colCmdWidth);
  const hTime = 'TIME'.padEnd(colTimeWidth);
  const hResult = 'RESULT';

  stdout.write(`${s.dim(hId)}  ${s.dim(hStatus)}  ${s.dim(hCmd)}  ${s.dim(hTime)}  ${s.dim(hResult)}\n`);
  stdout.write(`${divider}\n`);

  for (const rec of records) {
    const idText = `#${rec.id}`.padEnd(colIdWidth);
    const rawCmd = rec.fullCommand || `${rec.command} ${(rec.args || []).join(' ')}`.trim();
    const cmdTruncated = rawCmd.length > colCmdWidth
      ? rawCmd.slice(0, colCmdWidth - 3) + '...'
      : rawCmd.padEnd(colCmdWidth);

    const relTime = formatRelativeTime(rec.startTime).padEnd(colTimeWidth);
    const badge = formatStatusBadge(rec.status, s);
    const statusPadding = ' '.repeat(Math.max(0, colStatusWidth - rec.status.length));
    const resultSummary = getResultSummary(rec, s);

    stdout.write(`${s.bold(idText)}  ${badge}${statusPadding}  ${cmdTruncated}  ${s.dim(relTime)}  ${resultSummary}\n`);
  }

  stdout.write(`${divider}\n`);
  stdout.write(`${s.dim(`Showing ${records.length} of ${allRecords.length} incident(s). Run "${s.cyan('rewind show <id>')}" to inspect full forensic details.`)}\n\n`);

  return 0;
}
