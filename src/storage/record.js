import { computeFingerprint } from './fingerprint.js';
import { RecoveryStates } from './state.js';

/**
 * Storage record data contract.
 * @typedef {object} FailureRecord
 * @property {string} id - Monotonically increasing unique record ID (e.g. "1")
 * @property {string} fingerprint - Deterministic failure hash (16 hex chars)
 * @property {string} command - Target command executable
 * @property {string[]} args - Target command arguments
 * @property {string} fullCommand - Full command string
 * @property {string} cwd - Working directory at time of execution
 * @property {string} startTime - ISO start timestamp
 * @property {string} endTime - ISO end timestamp
 * @property {number} durationMs - Execution duration in milliseconds
 * @property {number|null} exitCode - Child exit code
 * @property {string|null} signal - Termination signal if any
 * @property {string} status - OBSERVED | SUSPECTED | FIXED | VERIFIED | REGRESSED | success
 * @property {string} stdout - Sanitized stdout
 * @property {string} stderr - Sanitized stderr
 * @property {string} stdoutRaw - Raw stdout bytes decoded as UTF-8
 * @property {string} stderrRaw - Raw stderr bytes decoded as UTF-8
 * @property {string} normalizedError - Canonically normalized error text for fingerprinting
 * @property {import('../git.js').GitMetadata} git - Repository metadata
 * @property {object} environment - Safe environment metadata
 * @property {string|null} regressionOf - ID of prior verified incident if this is a regression
 * @property {Array<{ timestamp: string, cause?: string, change?: string, verifyCmd?: string }>} recoveries - Attempted recovery actions
 * @property {{ verifiedAt: string, command: string, exitCode: number, durationMs: number, output: string }|null} verification - Verification execution result
 */

/**
 * Creates a structured FailureRecord from a command execution capture result.
 *
 * @param {string} id - Record identifier
 * @param {import('../capture.js').CaptureRecord} captureResult
 * @param {object} [options]
 * @param {string} [options.initialState] - Initial trust loop state
 * @param {string|null} [options.regressionOf] - Prior verified incident ID
 * @returns {FailureRecord}
 */
export function createRecord(id, captureResult, options = {}) {
  const { fingerprint, normalizedError } = computeFingerprint({
    command: captureResult.command,
    args: captureResult.args,
    exitCode: captureResult.exitCode,
    signal: captureResult.signal,
    stderr: captureResult.stderr,
    stdout: captureResult.stdout
  });

  const status = options.initialState || (captureResult.success ? 'success' : RecoveryStates.OBSERVED);

  return Object.freeze({
    id: String(id),
    fingerprint,
    command: captureResult.command,
    args: [...(captureResult.args || [])],
    fullCommand: captureResult.fullCommand,
    cwd: captureResult.cwd,
    startTime: captureResult.startTime,
    endTime: captureResult.endTime,
    durationMs: captureResult.durationMs,
    exitCode: captureResult.exitCode,
    signal: captureResult.signal,
    status,
    stdout: captureResult.stdout,
    stderr: captureResult.stderr,
    stdoutRaw: captureResult.stdoutRaw,
    stderrRaw: captureResult.stderrRaw,
    normalizedError,
    git: { ...captureResult.git },
    environment: { ...captureResult.environment },
    regressionOf: options.regressionOf || null,
    recoveries: [],
    verification: null
  });
}

/**
 * Validates whether an unparsed or parsed object conforms to the FailureRecord schema.
 *
 * @param {unknown} obj
 * @returns {boolean}
 */
export function isValidRecord(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }

  const record = /** @type {Record<string, unknown>} */ (obj);

  return (
    typeof record.id === 'string' &&
    record.id.trim() !== '' &&
    typeof record.fingerprint === 'string' &&
    typeof record.command === 'string' &&
    Array.isArray(record.args) &&
    typeof record.startTime === 'string' &&
    (typeof record.exitCode === 'number' || record.exitCode === null) &&
    typeof record.status === 'string' &&
    typeof record.stdout === 'string' &&
    typeof record.stderr === 'string'
  );
}
