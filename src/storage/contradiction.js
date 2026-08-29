import { sanitizeForDisplay } from '../sanitizer.js';

/**
 * @typedef {object} EvidenceConflictReport
 * @property {boolean} hasConflicts - True if contradiction or divergence detected
 * @property {'CONTRADICTED'|'DIVERGENT_EVIDENCE'|'CONSISTENT'} classification
 * @property {string[]} summary - High-level summary statements
 * @property {Array<{
 *   type: 'CONTRADICTED'|'DIVERGENT_EVIDENCE',
 *   description: string,
 *   evidenceA: object,
 *   evidenceB: object
 * }>} conflicts - Specific conflict pairings
 */

/**
 * Analyzes verification outcomes across all records sharing a failure fingerprint
 * to distinguish genuine contradictions from environmental divergence.
 *
 * @param {string} fingerprint
 * @param {Array<import('./record.js').IncidentRecord>} records
 * @returns {EvidenceConflictReport}
 */
export function analyzeEvidenceConflicts(fingerprint, records = []) {
  if (!fingerprint || !records || records.length === 0) {
    return {
      hasConflicts: false,
      classification: 'CONSISTENT',
      summary: [],
      conflicts: []
    };
  }

  // Collect all verified/failed verification runs with environment context
  const verificationPoints = [];

  for (const record of records) {
    if (!record) continue;

    if (Array.isArray(record.recoveryAttempts)) {
      for (const attempt of record.recoveryAttempts) {
        if (Array.isArray(attempt.verificationRuns)) {
          for (const run of attempt.verificationRuns) {
            verificationPoints.push({
              incidentId: record.id,
              attemptId: attempt.id,
              runId: run.id,
              command: run.command,
              change: attempt.change,
              cause: attempt.cause,
              exitCode: run.exitCode,
              result: run.result,
              executedAt: run.completedAt || run.startedAt,
              platform: record.environment?.platform || 'unknown',
              nodeMajor: record.environment?.nodeMajor ?? 'unknown',
              environmentFingerprint: run.environmentFingerprint || record.environment?.fingerprint || ''
            });
          }
        }
      }
    } else if (record.verification) {
      const isPassed = record.status === 'VERIFIED' || record.status === 'RECOVERED' || record.verification.exitCode === 0;
      verificationPoints.push({
        incidentId: record.id,
        attemptId: 1,
        runId: 1,
        command: record.verification.command,
        change: record.recoveries?.[record.recoveries.length - 1]?.change || null,
        cause: record.recoveries?.[record.recoveries.length - 1]?.cause || null,
        exitCode: record.verification.exitCode ?? (isPassed ? 0 : 1),
        result: isPassed ? 'PASSED' : 'FAILED',
        executedAt: record.verification.verifiedAt || record.verification.lastAttemptAt || record.startTime,
        platform: record.environment?.platform || 'unknown',
        nodeMajor: record.environment?.nodeMajor ?? 'unknown',
        environmentFingerprint: record.environment?.fingerprint || ''
      });
    }
  }

  const conflicts = [];
  let hasDirectContradiction = false;
  let hasDivergentEvidence = false;

  // Pairwise comparison of verification points
  for (let i = 0; i < verificationPoints.length; i++) {
    for (let j = i + 1; j < verificationPoints.length; j++) {
      const a = verificationPoints[i];
      const b = verificationPoints[j];

      // Check if outcomes differ (one passed, one failed)
      if (a.result !== b.result) {
        const sameCommand = a.command && b.command && a.command.trim().toLowerCase() === b.command.trim().toLowerCase();
        const samePlatform = a.platform !== 'unknown' && b.platform !== 'unknown' && a.platform === b.platform;
        const sameNodeMajor = a.nodeMajor !== 'unknown' && b.nodeMajor !== 'unknown' && a.nodeMajor === b.nodeMajor;
        const equivalentEnv = samePlatform && sameNodeMajor;

        if (sameCommand && equivalentEnv) {
          // Direct contradiction: Same command + equivalent environment + conflicting outcome
          hasDirectContradiction = true;
          conflicts.push({
            type: 'CONTRADICTED',
            description: `Verification command "${a.command}" succeeded in Incident #${a.incidentId} but failed in Incident #${b.incidentId} under equivalent environment (${a.platform}, Node v${a.nodeMajor}).`,
            evidenceA: a,
            evidenceB: b
          });
        } else {
          // Environmental / contextual divergence
          hasDivergentEvidence = true;
          const diffReasons = [];
          if (!samePlatform) diffReasons.push(`OS platform (${a.platform} vs ${b.platform})`);
          if (!sameNodeMajor) diffReasons.push(`Node runtime (v${a.nodeMajor} vs v${b.nodeMajor})`);
          if (!sameCommand) diffReasons.push(`Different verify commands ("${a.command}" vs "${b.command}")`);

          conflicts.push({
            type: 'DIVERGENT_EVIDENCE',
            description: `Different outcomes observed across varying contexts: ${diffReasons.join(', ')}.`,
            evidenceA: a,
            evidenceB: b
          });
        }
      }
    }
  }

  let classification = 'CONSISTENT';
  const summary = [];

  if (hasDirectContradiction) {
    classification = 'CONTRADICTED';
    summary.push(`Conflict detected: Identical verification actions produced contradictory outcomes under equivalent environment conditions.`);
  } else if (hasDivergentEvidence) {
    classification = 'DIVERGENT_EVIDENCE';
    summary.push(`Divergent evidence detected: Outcomes differed across different runtime platforms or verification commands.`);
  }

  return {
    hasConflicts: conflicts.length > 0,
    classification,
    summary,
    conflicts
  };
}

/**
 * Formats a conflict report for terminal display.
 *
 * @param {EvidenceConflictReport} conflictReport
 * @param {import('../formatter.js').createStyler} styler
 * @returns {string}
 */
export function formatContradictionSection(conflictReport, styler) {
  if (!conflictReport || !conflictReport.hasConflicts) {
    return '';
  }

  const s = styler;
  const lines = [];

  if (conflictReport.classification === 'CONTRADICTED') {
    lines.push(s.bold(s.red('CONFLICTING HISTORICAL EVIDENCE:')));
    lines.push(s.dim('  Rewind detected contradictory verification results for this failure fingerprint under equivalent conditions.'));
  } else {
    lines.push(s.bold(s.yellow('DIVERGENT HISTORICAL EVIDENCE:')));
    lines.push(s.dim('  Verification outcomes varied across different execution environments or verification commands.'));
  }

  lines.push('');

  for (const conflict of conflictReport.conflicts.slice(0, 3)) {
    const badge = conflict.type === 'CONTRADICTED' ? s.red('[CONTRADICTED]') : s.yellow('[DIVERGENT]');
    lines.push(`  ${badge} ${sanitizeForDisplay(conflict.description)}`);

    const a = conflict.evidenceA;
    const b = conflict.evidenceB;
    lines.push(`    • Incident #${a.incidentId} (${a.result}): ${sanitizeForDisplay(a.command)} on ${a.platform} Node v${a.nodeMajor}`);
    lines.push(`    • Incident #${b.incidentId} (${b.result}): ${sanitizeForDisplay(b.command)} on ${b.platform} Node v${b.nodeMajor}`);
    lines.push('');
  }

  return lines.join('\n');
}
