import { MissingArgumentError } from '../errors.js';
import { searchRecords } from '../storage/search.js';
import { formatJson } from '../formatter.js';
import { RecoveryStates } from '../storage/state.js';
import { sanitizeForDisplay } from '../sanitizer.js';

/**
 * Returns formatted colored confidence badge.
 *
 * @param {string} confidence
 * @param {import('../formatter.js').createStyler} s
 * @returns {string}
 */
function formatConfidenceBadge(confidence, s) {
  switch (confidence) {
    case 'VERIFIED':
      return s.green(s.bold('[VERIFIED RECOVERY]'));
    case 'LIKELY':
      return s.cyan(s.bold('[LIKELY PATTERN]'));
    case 'NOT PROVEN':
    default:
      return s.dim('[NOT PROVEN]');
  }
}

/**
 * Handler for `rewind search <query...> [options]`.
 * Deterministically searches historical failures using token overlap and fingerprint matching.
 * All terminal display output is sanitized to prevent ANSI injection and secret leakage.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function searchCommand({ context }) {
  const { parsedArgs, storage, stdout, styler } = context;
  const queryTokens = parsedArgs.positional;

  if (!queryTokens || queryTokens.length === 0) {
    throw new MissingArgumentError('query', 'rewind search <query...> [--limit N] [--json]');
  }

  const query = queryTokens.join(' ');
  const allRecords = storage.listRecords();
  const matches = searchRecords(query, allRecords, { limit: parsedArgs.flags.limit });

  if (parsedArgs.flags.json) {
    stdout.write(formatJson({
      status: 'success',
      query,
      count: matches.length,
      data: matches
    }) + '\n');
    return 0;
  }

  const s = styler;
  const termWidth = (stdout && typeof stdout.columns === 'number' && stdout.columns > 20)
    ? Math.min(stdout.columns, 80)
    : 80;
  const divider = s.dim('─'.repeat(termWidth));

  if (matches.length === 0) {
    const tag = s.badge('rewind:search', s.yellow);
    stdout.write(`\n${tag} No matching failure records found for query: "${sanitizeForDisplay(query)}"\n`);
    stdout.write(`Run "${s.cyan('rewind history')}" to browse all past incidents.\n\n`);
    return 0;
  }

  stdout.write(`\n${s.bold(`SEARCH RESULTS for "${sanitizeForDisplay(query)}"`)} ${s.dim(`(${matches.length} candidate(s))`)}\n`);
  stdout.write(`${divider}\n`);

  for (const match of matches) {
    const rec = match.record;
    const scorePct = `${Math.round(match.score * 100)}%`;
    const confBadge = formatConfidenceBadge(match.confidence, s);
    const idBadge = s.bold(`#${match.id}`);
    const fpBadge = s.dim(`[fp: ${rec.fingerprint ? rec.fingerprint.slice(0, 8) : 'none'}]`);

    stdout.write(`\n${confBadge} Incident ${idBadge} ${fpBadge} — Similarity: ${s.bold(scorePct)}\n`);
    stdout.write(`  ${s.dim('Status:'.padEnd(16))} ${rec.status}\n`);
    stdout.write(`  ${s.dim('Command:'.padEnd(16))} ${sanitizeForDisplay(rec.fullCommand || rec.command)}\n`);
    stdout.write(`  ${s.dim('Match Reason:'.padEnd(16))} ${s.yellow(sanitizeForDisplay(match.reason))}\n`);

    // Surface historical recovery evidence
    if (Array.isArray(rec.recoveries) && rec.recoveries.length > 0) {
      const last = rec.recoveries[rec.recoveries.length - 1];
      if (last.cause) stdout.write(`  ${s.dim('Suspected Cause:'.padEnd(18))} ${sanitizeForDisplay(last.cause)}\n`);
      if (last.change) stdout.write(`  ${s.dim('Historical Fix:'.padEnd(18))} ${sanitizeForDisplay(last.change)}\n`);
      if (last.verifyCmd) stdout.write(`  ${s.dim('Verify Command:'.padEnd(18))} ${s.cyan(sanitizeForDisplay(last.verifyCmd))}\n`);
    }

    if (rec.status === RecoveryStates.VERIFIED && rec.verification) {
      stdout.write(`  ${s.green('✔ Verified under recorded conditions at ' + (rec.verification.verifiedAt || ''))}\n`);
    }
  }

  stdout.write(`\n${divider}\n`);
  stdout.write(`${s.dim('Note: Similarity retrieves evidence. Verification establishes truth.')}\n`);
  stdout.write(`${s.dim(`Showing top ${matches.length} candidate(s). Run "${s.cyan('rewind show <id>')}" for complete forensic evidence.`)}\n\n`);

  return 0;
}
