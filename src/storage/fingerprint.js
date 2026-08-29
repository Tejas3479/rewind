import crypto from 'node:crypto';
import path from 'node:path';
import { normalizeErrorText } from './normalizer.js';

/**
 * Generates a deterministic SHA-256 fingerprint from failure properties.
 *
 * Fields contributing to the fingerprint (in order):
 * 1. Normalized command executable name (basename, lowercased)
 * 2. Normalized argument list (joined, trimmed)
 * 3. Process exit code or termination signal
 * 4. Canonically normalized error text (from stderr, or stdout fallback)
 *
 * @param {object} params
 * @param {string} params.command - Executable command
 * @param {string[]} [params.args=[]] - Command arguments
 * @param {number|null} [params.exitCode=1] - Exit code
 * @param {string|null} [params.signal=null] - Termination signal
 * @param {string} [params.stderr=''] - Stderr content
 * @param {string} [params.stdout=''] - Stdout content
 * @returns {{ fingerprint: string, normalizedError: string }}
 */
export function computeFingerprint({
  command = '',
  args = [],
  exitCode = null,
  signal = null,
  stderr = '',
  stdout = ''
} = {}) {
  // 1. Normalized command basename (e.g. "node.exe" -> "node", "npm" -> "npm")
  const cmdBase = path.basename(command).replace(/\.(?:exe|cmd|bat|sh|ps1)$/i, '').toLowerCase();

  // 2. Normalized arguments
  const argsSignature = (args || []).map((a) => String(a).trim()).join(' ');

  // 3. Normalized error content (primary from stderr, fallback to stdout)
  const rawError = (stderr && stderr.trim()) ? stderr : (stdout || '');
  const normalizedError = normalizeErrorText(rawError);

  // 4. Deterministic structured payload
  const payload = [
    `cmd:${cmdBase}`,
    `args:${argsSignature}`,
    `code:${exitCode ?? 'null'}`,
    `sig:${signal ?? 'null'}`,
    `err:${normalizedError}`
  ].join('\n--REWIND-FP-SEP--\n');

  const fingerprint = crypto
    .createHash('sha256')
    .update(payload, 'utf8')
    .digest('hex')
    .slice(0, 16);

  return {
    fingerprint,
    normalizedError
  };
}
