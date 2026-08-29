/**
 * Sanitizer for untrusted process terminal output.
 * Strips ANSI color codes, cursor manipulation sequences, OSC titles,
 * and dangerous terminal control codes.
 */

// Matches CSI sequences, OSC sequences, and standard 2-byte escape sequences
const ANSI_REGEX = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[PX^_][^\u001b]*\u001b\\|\u001b[NnOH]/g;

/**
 * Strips ANSI escape sequences from a string.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(ANSI_REGEX, '');
}

/**
 * Sanitizes untrusted terminal output for safe storage and plain-text display.
 * - Strips ANSI escape codes
 * - Normalizes line endings to \n
 * - Strips non-printable ASCII control characters except \n, \r, \t
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeOutput(text) {
  if (typeof text !== 'string') {
    return '';
  }

  // 1. Strip ANSI escape codes
  const stripped = stripAnsi(text);

  // 2. Normalize Windows/Unix line breaks
  const normalized = stripped.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Remove non-printable control characters (ASCII 0-8, 11-12, 14-31, 127)
  // Keep \t (9), \n (10)
  return normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
