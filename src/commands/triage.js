import readline from 'node:readline/promises';
import {
  getTriageCandidateIncidents,
  getIncidentForTriage,
  formatIncidentSummary,
  formatReviewScreen,
  observeSafeWorkspaceChanges,
  recordTriageRecovery,
  executeTriageVerification
} from '../triage/engine.js';
import { formatStatusBadge, formatBox } from '../formatter.js';
import { sanitizeForDisplay } from '../sanitizer.js';
import { formatContradictionSection } from '../storage/contradiction.js';
import { CliError } from '../errors.js';

/**
 * Prompts user for input via readline promises interface with safe EOF handling.
 *
 * @param {readline.Interface} rl
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function promptUser(rl, prompt) {
  try {
    const answer = await rl.question(prompt);
    return (answer || '').trim();
  } catch {
    return '';
  }
}

/**
 * Handler for `rewind triage [id]`.
 * Interactive 7-step guided recovery triage workflow.
 *
 * @param {object} params
 * @param {import('../cli.js').CliContext} params.context
 * @returns {Promise<number>}
 */
export async function triageCommand({ context }) {
  const { parsedArgs, storage, config, stdout, styler } = context;
  const s = styler;

  // Non-Interactive TTY Guard
  const isInteractive = Boolean(context.isTTY || (context.stdin?.isTTY && context.stdout?.isTTY));
  if (!isInteractive) {
    stdout.write('This command requires an interactive terminal. Use the non-interactive recovery command instead.\n');
    return 1;
  }

  const rl = readline.createInterface({
    input: context.stdin || process.stdin,
    output: context.stdout || process.stdout,
    terminal: Boolean(context.stdin?.isTTY && typeof context.stdin?.setRawMode === 'function')
  });

  let isClosed = false;
  rl.on('close', () => {
    isClosed = true;
  });

  try {
    // ============================================================
    // STEP 1: Select Incident
    // ============================================================
    let targetRecord = null;
    const rawId = parsedArgs.positional[0];

    if (rawId) {
      targetRecord = getIncidentForTriage(storage, rawId);
    } else {
      const candidates = getTriageCandidateIncidents(storage);
      const all = candidates.all;
      const unrecovered = candidates.unrecovered;

      if (all.length === 0) {
        stdout.write(`\nNo recorded incidents found in the ledger.\nRun a command with "${s.cyan('rewind run <command>')}" to begin tracking failures.\n\n`);
        rl.close();
        return 0;
      }

      if (all.length === 1) {
        targetRecord = all[0];
      } else {
        const displayList = unrecovered.length > 0 ? unrecovered.slice(0, 5) : all.slice(0, 5);
        stdout.write(`\n${s.bold('SELECT INCIDENT TO TRIAGE:')}\n`);
        for (let i = 0; i < displayList.length; i++) {
          const inc = displayList[i];
          const badge = formatStatusBadge(inc.status, s);
          const cmd = sanitizeForDisplay((inc.fullCommand || inc.command || '').slice(0, 30));
          const errSnip = inc.diagnostic?.errorType || inc.diagnostic?.message || (inc.stderr || '').split('\n')[0] || '';
          stdout.write(`  [${i + 1}] ${s.bold(`Incident #${inc.id}`)} ${badge} ${s.dim(`(${cmd})`)} ${s.dim(errSnip.slice(0, 35))}\n`);
        }

        const defaultTarget = displayList[0];
        const answer = await promptUser(rl, `\nSelect incident (1-${displayList.length} or ID, default: #${defaultTarget.id}): `);

        if (!answer) {
          targetRecord = defaultTarget;
        } else {
          const numChoice = Number.parseInt(answer, 10);
          if (!Number.isNaN(numChoice) && numChoice >= 1 && numChoice <= displayList.length) {
            targetRecord = displayList[numChoice - 1];
          } else {
            targetRecord = getIncidentForTriage(storage, answer);
          }
        }
      }
    }

    if (!targetRecord) {
      throw new CliError('No valid incident selected.', { code: 'ERR_INVALID_INPUT', exitCode: 1 });
    }

    // ============================================================
    // STEP 2: Display Incident Summary
    // ============================================================
    stdout.write(formatIncidentSummary(targetRecord, s) + '\n');

    // ============================================================
    // STEP 3: Suspected Cause
    // ============================================================
    stdout.write(`${s.bold('Step 1 of 3: Suspected Root Cause')}\n`);
    const cause = await promptUser(rl, 'What was the suspected cause? (e.g. "Missing PORT env var"):\n> ');

    // ============================================================
    // STEP 4: Remediation Change
    // ============================================================
    stdout.write(`\n${s.bold('Step 2 of 3: Remediation Fix')}\n`);
    const change = await promptUser(rl, 'What change did you make? (e.g. "Added default port in config.js"):\n> ');

    // ============================================================
    // STEP 5: Verification Command
    // ============================================================
    stdout.write(`\n${s.bold('Step 3 of 3: Verification Plan')}\n`);
    const verifyCmd = await promptUser(rl, 'What command verifies this recovery? (e.g. "npm test"):\n> ');

    // Abort check if nothing entered
    if (!cause && !change && !verifyCmd) {
      stdout.write(`\n${s.yellow('No recovery details entered. Triage aborted.')}\n\n`);
      rl.close();
      return 0;
    }

    // ============================================================
    // STEP 6: Review Screen & Record
    // ============================================================
    stdout.write('\n' + formatReviewScreen({ cause, change, verifyCmd }, s) + '\n');

    // Safely capture non-secret file changes if available
    const observedChanges = observeSafeWorkspaceChanges(config.rootDir || process.cwd());

    const { updatedRecord, attempt } = recordTriageRecovery(storage, {
      incidentId: targetRecord.id,
      cause,
      change,
      verifyCmd,
      observedChanges
    });

    const divider = s.dim('─'.repeat(64));
    stdout.write(`\n${s.bold('RECOVERY RECORDED')}  ${s.dim(`[Incident #${targetRecord.id}, Attempt #${attempt.id}]`)}\n`);
    stdout.write(`${divider}\n`);
    stdout.write(`  ${s.dim('Incident Status:'.padEnd(20))} ${formatStatusBadge(updatedRecord.status, s)}\n`);
    stdout.write(`  ${s.dim('Attempt Status:'.padEnd(20))} ${formatStatusBadge(attempt.status, s)} ${s.yellow('(User Claim — Unverified)')}\n`);
    stdout.write(`  ${s.dim('Evidence Quality:'.padEnd(20))} ${s.cyan(attempt.evidenceQuality || 'UNVERIFIED')}\n`);

    if (cause) {
      stdout.write(`  ${s.dim('[USER CLAIM] Cause:'.padEnd(20))} ${sanitizeForDisplay(cause)}\n`);
    }
    if (change) {
      stdout.write(`  ${s.dim('[USER CLAIM] Fix:'.padEnd(20))} ${sanitizeForDisplay(change)}\n`);
    }
    if (observedChanges && Array.isArray(observedChanges.files) && observedChanges.files.length > 0) {
      stdout.write(`  ${s.dim('[OBSERVED CHANGE]:'.padEnd(20))} ${s.dim(observedChanges.files.join(', '))}\n`);
    }
    if (verifyCmd) {
      stdout.write(`  ${s.dim('Verify Command:'.padEnd(20))} ${s.cyan(sanitizeForDisplay(verifyCmd))}\n`);
    }
    stdout.write(`${divider}\n`);

    // ============================================================
    // STEP 7: Explicit Verification Execution
    // ============================================================
    if (verifyCmd) {
      const runNow = await promptUser(rl, `\nRun verification command now? [y/N]: `);
      const shouldRun = runNow.toLowerCase() === 'y' || runNow.toLowerCase() === 'yes';

      if (shouldRun) {
        stdout.write(`\n${s.badge('rewind:verify', s.cyan)} Executing user-approved verification command for Incident #${targetRecord.id} [Attempt #${attempt.id}]:\n`);
        stdout.write(`  ${s.bold(s.cyan('$ ' + sanitizeForDisplay(verifyCmd)))}\n\n`);

        const verifyResult = await executeTriageVerification({
          context,
          incidentId: targetRecord.id,
          attemptId: attempt.id,
          verifyCmd,
          timeoutMs: parsedArgs.flags.timeout || 60000,
          shell: parsedArgs.flags.shell
        });

        if (verifyResult.success) {
          const verifiedAtIso = new Date().toISOString();
          const tag = s.badge('rewind', s.green);
          stdout.write(`\n${tag} ${s.bold(s.green('VERIFIED!'))} Incident #${targetRecord.id} [Attempt #${attempt.id}] successfully validated.\n`);

          const box = formatBox('✓ RECOVERY VERIFIED', [
            { label: 'Incident', value: `#${targetRecord.id}` },
            { label: 'Attempt', value: `#${attempt.id}` },
            { label: 'Verify Command', value: verifyCmd },
            { label: 'Exit Code', value: '0 (Success)' },
            { label: 'Duration', value: `${verifyResult.durationMs}ms` },
            { label: 'Verified At', value: verifiedAtIso }
          ], s, 'success');

          stdout.write(`\n${box}\n\n`);
          stdout.write(`The verified recovery has been sealed into the ledger.\n`);
          stdout.write(`Future occurrences of this failure signature will detect this verified fix.\n`);

          if (verifyResult.conflictReport && verifyResult.conflictReport.hasConflicts) {
            stdout.write(`\n${formatContradictionSection(verifyResult.conflictReport, s)}`);
          }

          stdout.write('\n');
          rl.close();
          return 0;
        } else {
          const tag = s.badge('rewind', s.red);
          const failureMsg = verifyResult.timedOut
            ? 'Verification command timed out.'
            : `Verification command failed with exit code ${verifyResult.exitCode}.`;

          stdout.write(`\n${tag} ${s.bold(s.red('NOT VERIFIED:'))} ${failureMsg}\n`);

          const box = formatBox('✗ VERIFICATION FAILED (Preserved in Negative Memory)', [
            { label: 'Incident', value: `#${targetRecord.id}` },
            { label: 'Attempt', value: `#${attempt.id} (Marked FAILED)` },
            { label: 'Verify Command', value: verifyCmd },
            { label: 'Result', value: String(verifyResult.exitCode) },
            { label: 'Duration', value: `${verifyResult.durationMs}ms` }
          ], s, 'error');

          stdout.write(`\n${box}\n\n`);
          stdout.write(`Attempt #${attempt.id} has been permanently sealed into negative memory as a failed approach.\n`);
          stdout.write(`Incident #${targetRecord.id} remains in state: OPEN.\n`);
          stdout.write(`To try a new remediation, run: "${s.cyan(`rewind triage ${targetRecord.id}`)}" or "${s.cyan(`rewind recover ${targetRecord.id} --change "..." --verify-cmd "..."`)}"\n\n`);

          rl.close();
          return verifyResult.exitCode || 1;
        }
      } else {
        stdout.write(`\nRecovery recorded. Verification skipped.\n`);
        stdout.write(`Incident #${targetRecord.id} remains in state: ${s.yellow('OPEN (FIXED — NOT YET VERIFIED)')}.\n`);
        stdout.write(`To verify later, run: "${s.cyan(`rewind verify ${targetRecord.id}`)}"\n\n`);
        rl.close();
        return 0;
      }
    } else {
      stdout.write(`\nRecovery recorded (Missing verification command).\n`);
      stdout.write(`Incident #${targetRecord.id} remains in state: ${s.yellow('OPEN (FIXED — NOT YET VERIFIED)')}.\n`);
      stdout.write(`To record a verification command, run: "${s.cyan(`rewind recover ${targetRecord.id} --verify-cmd "<command>"`)}"\n\n`);
      rl.close();
      return 0;
    }
  } catch (err) {
    if (!isClosed) {
      rl.close();
    }
    throw err;
  }
}
