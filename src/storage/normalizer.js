/**
 * Conservative failure error output normalizer.
 * Strips transient runtime noise (timestamps, PIDs, UUIDs, memory addresses,
 * temp directories, duration timers) while strictly preserving semantic diagnostic structure.
 */

// UUID v1-v5 format
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

// ISO 8601 timestamps (e.g. 2026-08-29T07:51:51.688Z)
const ISO_TIMESTAMP_REGEX = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/g;

// Standard HTTP/RFC date formats (e.g. Sat, 29 Aug 2026 13:21:49 GMT)
const RFC_DATE_REGEX = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}:\d{2}(?:\s+[A-Z]{3,4})?\b/gi;

// Standalone time patterns (e.g. 13:21:49.123)
const TIME_REGEX = /\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g;

// Memory addresses and hex pointers (e.g. 0x00007ff7beef1234, 0x7ffee4b6c890)
const HEX_ADDR_REGEX = /\b0x[0-9a-fA-F]{6,16}\b/g;

// Process IDs (e.g. pid: 1234, PID=5678, [pid 9012], (pid=3456))
const PID_BRACKET_REGEX = /\[pid\s*\d+\]/gi;
const PID_PAREN_REGEX = /\(pid=\d+\)/gi;
const PID_TEXT_REGEX = /\b(?:pid|PID|process\s+id)[:=\s]+\d+\b/g;

// Temporary directories and file paths
const WIN_TEMP_PATH_REGEX = /[A-Z]:\\[^ \t\r\n'"]*\\(?:Temp|tmp)\\[^ \t\r\n'"]+/gi;
const UNIX_TEMP_PATH_REGEX = /(?:\/tmp|\/var\/tmp|\/private\/tmp|\/var\/folders\/[^ \t\r\n'"]+)\/[^ \t\r\n'"]+/g;

// Execution durations / elapsed times (e.g. "took 145ms", "in 2.4s", "(150ms)")
const DURATION_TEXT_REGEX = /\b(?:in|took)\s+\d+(?:\.\d+)?\s*(?:ms|s|seconds|sec)\b/gi;
const DURATION_PAREN_REGEX = /\(\s*\d+(?:\.\d+)?\s*(?:ms|s|seconds|sec)\s*\)/gi;

/**
 * Normalizes an error string by replacing transient noise tokens with canonical placeholders.
 *
 * @param {string} text - Raw or sanitized error string
 * @returns {string} - Canonically normalized error string
 */
export function normalizeErrorText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  let normalized = text;

  // 1. Normalize line endings
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Replace generated UUIDs
  normalized = normalized.replace(UUID_REGEX, '<UUID>');

  // 3. Replace timestamps and dates
  normalized = normalized.replace(ISO_TIMESTAMP_REGEX, '<TIMESTAMP>');
  normalized = normalized.replace(RFC_DATE_REGEX, '<TIMESTAMP>');
  normalized = normalized.replace(TIME_REGEX, '<TIME>');

  // 4. Replace memory addresses & hex pointers
  normalized = normalized.replace(HEX_ADDR_REGEX, '<HEX_ADDR>');

  // 5. Replace Process IDs (PIDs)
  normalized = normalized.replace(PID_BRACKET_REGEX, '[pid <PID>]');
  normalized = normalized.replace(PID_PAREN_REGEX, '(pid=<PID>)');
  normalized = normalized.replace(PID_TEXT_REGEX, 'pid <PID>');

  // 6. Replace temporary paths
  normalized = normalized.replace(WIN_TEMP_PATH_REGEX, '<TEMP_PATH>');
  normalized = normalized.replace(UNIX_TEMP_PATH_REGEX, '<TEMP_PATH>');

  // 7. Replace duration and elapsed time mentions
  normalized = normalized.replace(DURATION_TEXT_REGEX, 'in <DURATION>');
  normalized = normalized.replace(DURATION_PAREN_REGEX, '(<DURATION>)');

  // 8. Clean trailing whitespace from lines
  return normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}
