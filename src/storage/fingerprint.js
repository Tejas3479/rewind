import crypto from 'node:crypto';

/**
 * Generates a deterministic SHA-256 fingerprint from failure properties.
 *
 * @param {object} params
 * @param {string} params.command - Executable command
 * @param {string[]} [params.args=[]] - Command arguments
 * @param {number|null} [params.exitCode=1] - Exit code
 * @param {string} [params.stderr=''] - Sanitized stderr
 * @param {string} [params.stdout=''] - Sanitized stdout
 * @returns {string} - 16-character hexadecimal fingerprint
 */
export function computeFingerprint({
  command = '',
  args = [],
  exitCode = null,
  stderr = '',
  stdout = ''
} = {}) {
  // Normalize command tokens
  const cmdSignature = [command, ...args].join(' ').trim().toLowerCase();

  // Extract primary error signature (first 10 non-empty lines of stderr, or stdout fallback)
  const errorLines = (stderr || stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join('\n');

  const payload = [
    `cmd:${cmdSignature}`,
    `code:${exitCode ?? 'null'}`,
    `err:${errorLines}`
  ].join('||');

  return crypto
    .createHash('sha256')
    .update(payload, 'utf8')
    .digest('hex')
    .slice(0, 16);
}
