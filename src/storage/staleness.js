import { captureSafeEnvironment } from '../environment.js';
import { readGitMetadata } from '../git.js';

/**
 * @typedef {object} StalenessEvaluation
 * @property {boolean} isStale - Whether historical evidence should be marked STALE
 * @property {'IDENTICAL'|'MINOR_CHANGE'|'RELEVANT_CHANGE'|'UNKNOWN'} level - Significance level
 * @property {string[]} reasons - Human-readable explanations of relevant divergence
 * @property {object} diffs - Detailed environment and context comparisons
 */

/**
 * Evaluates whether historical verified recovery evidence may be stale relative
 * to the current execution environment and repository state.
 *
 * Uses relevance-aware heuristics:
 * - Major Node.js runtime version bumps (e.g. v20 -> v22) or platform changes trigger STALE.
 * - Minor/patch bumps (e.g. v24.19 -> v24.20) do NOT trigger STALE.
 * - Git commit divergence is recorded as context but does not falsely invalidate records.
 *
 * @param {import('./record.js').IncidentRecord} historicalRecord
 * @param {import('../environment.js').EnvironmentSnapshot} [currentEnv]
 * @param {import('../git.js').GitMetadata} [currentGit]
 * @returns {StalenessEvaluation}
 */
export function evaluateStaleness(historicalRecord, currentEnv, currentGit) {
  if (!historicalRecord || typeof historicalRecord !== 'object') {
    return {
      isStale: false,
      level: 'UNKNOWN',
      reasons: ['No historical record available for staleness comparison.'],
      diffs: {}
    };
  }

  const envNow = currentEnv || captureSafeEnvironment();
  const gitNow = currentGit || readGitMetadata();

  const envPast = historicalRecord.environment || {};
  const gitPast = historicalRecord.git || {};

  const reasons = [];
  let isStale = false;
  let level = 'IDENTICAL';

  // 1. Runtime Major Version Check
  const pastMajor = envPast.nodeMajor !== undefined
    ? envPast.nodeMajor
    : (envPast.nodeVersion ? Number.parseInt(envPast.nodeVersion.replace(/^v/, ''), 10) : null);
  const currentMajor = envNow.nodeMajor !== undefined
    ? envNow.nodeMajor
    : (envNow.nodeVersion ? Number.parseInt(envNow.nodeVersion.replace(/^v/, ''), 10) : null);

  const runtimeMajorChanged = pastMajor !== null && currentMajor !== null && pastMajor !== currentMajor;
  const runtimeExactChanged = envPast.nodeVersion && envNow.nodeVersion && envPast.nodeVersion !== envNow.nodeVersion;

  if (runtimeMajorChanged) {
    isStale = true;
    level = 'RELEVANT_CHANGE';
    reasons.push(`Runtime major version changed: Node.js ${envPast.nodeVersion || pastMajor} → Node.js ${envNow.nodeVersion || currentMajor}`);
  } else if (runtimeExactChanged) {
    if (level === 'IDENTICAL') level = 'MINOR_CHANGE';
  }

  // 2. OS Platform & Architecture Check
  const platformChanged = envPast.platform && envNow.platform && envPast.platform !== envNow.platform;
  const archChanged = envPast.arch && envNow.arch && envPast.arch !== envNow.arch;

  if (platformChanged) {
    isStale = true;
    level = 'RELEVANT_CHANGE';
    reasons.push(`OS Platform changed: ${envPast.platform} → ${envNow.platform}`);
  }

  if (archChanged) {
    isStale = true;
    level = 'RELEVANT_CHANGE';
    reasons.push(`CPU architecture changed: ${envPast.arch} → ${envNow.arch}`);
  }

  // 3. Relevant Configuration Context Check
  // If the historical recovery changed specific env keys (e.g. DATABASE_URL, PORT), check if those keys are still present
  const latestAttempt = Array.isArray(historicalRecord.recoveryAttempts) && historicalRecord.recoveryAttempts.length > 0
    ? historicalRecord.recoveryAttempts[historicalRecord.recoveryAttempts.length - 1]
    : null;

  if (latestAttempt && latestAttempt.change) {
    const textToCheck = `${latestAttempt.change} ${latestAttempt.cause || ''}`;
    const envKeyMatches = textToCheck.match(/\b[A-Z0-9_]{3,30}\b/g) || [];

    for (const key of envKeyMatches) {
      if (key !== 'PATH' && key !== 'PORT' && key !== 'NODE_ENV' && key.length > 3) {
        const wasPresent = envPast.envKeys ? envPast.envKeys.includes(key) : false;
        const isPresent = envNow.envKeys ? envNow.envKeys.includes(key) : false;
        if (wasPresent && !isPresent) {
          isStale = true;
          level = 'RELEVANT_CHANGE';
          reasons.push(`Relevant environment variable "${key}" referenced in historical fix is missing from current environment.`);
        }
      }
    }
  }

  // 4. Git Context (Recorded as context, does not trigger STALE by itself)
  const gitDiverged = Boolean(
    gitPast.headCommit &&
    gitNow.headCommit &&
    gitPast.headCommit !== gitNow.headCommit
  );

  const diffs = {
    runtime: {
      historical: envPast.nodeVersion || 'unknown',
      current: envNow.nodeVersion || 'unknown',
      changed: Boolean(runtimeExactChanged),
      majorChanged: Boolean(runtimeMajorChanged)
    },
    platform: {
      historical: envPast.platform || 'unknown',
      current: envNow.platform || 'unknown',
      changed: Boolean(platformChanged)
    },
    arch: {
      historical: envPast.arch || 'unknown',
      current: envNow.arch || 'unknown',
      changed: Boolean(archChanged)
    },
    git: {
      historicalBranch: gitPast.branch || 'unknown',
      currentBranch: gitNow.branch || 'unknown',
      historicalCommit: gitPast.headCommit ? gitPast.headCommit.slice(0, 8) : 'none',
      currentCommit: gitNow.headCommit ? gitNow.headCommit.slice(0, 8) : 'none',
      diverged: gitDiverged
    }
  };

  return {
    isStale,
    level,
    reasons,
    diffs
  };
}
