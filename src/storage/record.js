import { computeFingerprint } from './fingerprint.js';

/**
 * Storage record data contract.
 * @typedef {object} FailureRecord
 * @property {string} id - Monotonically increasing unique record ID (e.g. "1")
 * @property {string} fingerprint - Deterministic failure hash
 * @property {string} command - Target command executable
 * @property {string[]} args - Target command arguments
 * @property {string} fullCommand - Full command string
 * @property {string} cwd - Working directory at time of execution
 * @property {string} startTime - ISO start timestamp
 * @property {string} endTime - ISO end timestamp
 * @property {number} durationMs - Execution duration in milliseconds
 * @property {number|null} exitCode - Child exit code
 * @property {string|null} signal - Termination signal if any
 * @property {string} status - 'failed' | 'success'
 * @property {string} stdout - Sanitized stdout
 * @property {string} stderr - Sanitized stderr
 * @property {string} stdoutRaw - Raw stdout bytes decoded as UTF-8
 * @property {string} stderrRaw - Raw stderr bytes decoded as UTF-8
 * @property {import('../git.js').GitMetadata} git - Repository metadata
 * @property {object} environment - Safe environment metadata
 * @property {Array<object>} recoveries - Attempted recovery actions
 * @property {object|null} verification - Verification state and command
 */

/**
 * Creates a structured FailureRecord from a command execution capture result.
 *
 * @param {string} id - Record identifier
 * @param {import('../capture.js').CaptureRecord} captureResult
 * @returns {FailureRecord}
 */
export function createRecord(id, captureResult) {
  const fingerprint = computeFingerprint({
    command: captureResult.command,
    args: captureResult.args,
    exitCode: captureResult.exitCode,
    stderr: captureResult.stderr,
    stdout: captureResult.stdout
  });

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
    status: captureResult.success ? 'success' : 'failed',
    stdout: captureResult.stdout,
    stderr: captureResult.stderr,
    stdoutRaw: captureResult.stdoutRaw,
    stderrRaw: captureResult.stderrRaw,
    git: { ...captureResult.git },
    environment: { ...captureResult.environment },
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
