import { formatJson } from '../formatter.js';
import { RecoveryStates } from '../storage/state.js';

/**
 * Formats ISO timestamp for concise terminal table display.
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  } catch {
    return isoString;
  }
}

/**
 * Returns colored state label.
 *
 * @param {string} status
 * @param {import('../formatter.js').createStyler} s
 * @returns {string}
 */
function formatStatus(status, s) {
  switch (status) {
    case RecoveryStates.VERIFIED:
      return s.green(s.bold('VERIFIED'));
    case RecoveryStates.REGRESSED:
      return s.red(s.bold('REGRESSED'));
    case RecoveryStates.FIXED:
      return s.cyan('FIXED');
    case RecoveryStates.SUSPECTED:
      return s.yellow('SUSPECTED');
    case RecoveryStates.OBSERVED:
    default:
      return s.dim(status || 'OBSERVED');
  }
}

/**
 * Handler for `rewind history [options]`.
 * Lists historical failure incidents sorted newest first, with support for --limit and --json.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function historyCommand({ context }) {
  const { parsedArgs, storage, stdout, styler } = context;

  const allRecords = storage.listRecords();
  // Sort newest first (highest ID / latest timestamp first)
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

  if (records.length === 0) {
    const tag = styler.badge('rewind', styler.yellow);
    stdout.write(`${tag} No recorded incidents in ledger.\nRun "${styler.cyan('rewind run <command...>')}" to start capturing failures.\n`);
    return 0;
  }

  // Column headers
  const headerId = 'ID'.padEnd(6);
  const headerFp = 'FINGERPRINT'.padEnd(14);
  const headerStatus = 'STATUS'.padEnd(14);
  const headerCode = 'EXIT'.padEnd(6);
  const headerTime = 'TIMESTAMP'.padEnd(24);
  const headerCmd = 'COMMAND';

  stdout.write(styler.bold(`${headerId} ${headerFp} ${headerStatus} ${headerCode} ${headerTime} ${headerCmd}\n`));
  stdout.write(styler.dim('─'.repeat(80) + '\n'));

  for (const rec of records) {
    const idStr = `#${rec.id}`.padEnd(6);
    const fpStr = (rec.fingerprint ? rec.fingerprint.slice(0, 12) : '────────────').padEnd(14);
    const statusStr = rec.status.padEnd(14);
    const codeStr = String(rec.exitCode ?? '─').padEnd(6);
    const timeStr = formatTimestamp(rec.startTime).padEnd(24);
    const cmdStr = (rec.fullCommand || `${rec.command} ${(rec.args || []).join(' ')}`).slice(0, 36);

    const formattedStatus = formatStatus(rec.status, styler);

    // Padding adjustment for colored status
    const statusCol = rec.status.length < 14 ? formattedStatus + ' '.repeat(14 - rec.status.length) : formattedStatus;

    stdout.write(`${styler.bold(idStr)} ${styler.cyan(fpStr)} ${statusCol} ${codeStr} ${styler.dim(timeStr)} ${cmdStr}\n`);
  }

  stdout.write(styler.dim('─'.repeat(80) + '\n'));
  stdout.write(`${styler.dim(`Showing ${records.length} of ${allRecords.length} incident(s). Run "${styler.cyan('rewind show <id>')}" to inspect full details.`)}\n`);

  return 0;
}
