/**
 * Formatter handles terminal color styling, TTY detection, NO_COLOR compliance,
 * and JSON serialization.
 */

/**
 * ANSI escape codes for basic terminal formatting.
 */
const ANSI_CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m'
};

/**
 * Checks if color output should be enabled for a given stream and environment.
 *
 * Rules:
 * 1. If explicitly disabled via flag (noColorFlag = true), color is FALSE.
 * 2. If NO_COLOR environment variable is set and not empty, color is FALSE (https://no-color.org).
 * 3. If FORCE_COLOR is set to '1', 'true', or non-zero, color is TRUE.
 * 4. If stream is a TTY and NODE_DISABLE_COLORS is not set, color is TRUE.
 * 5. Otherwise, color is FALSE.
 *
 * @param {object} [options]
 * @param {boolean} [options.isTTY=false]
 * @param {Record<string, string>} [options.env=process.env]
 * @param {boolean} [options.noColorFlag=false]
 * @returns {boolean}
 */
export function shouldEnableColor({ isTTY = false, env = process.env, noColorFlag = false } = {}) {
  if (noColorFlag) {
    return false;
  }
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false;
  }
  if (env.NODE_DISABLE_COLORS === '1') {
    return false;
  }
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== '') {
    return true;
  }
  return Boolean(isTTY);
}

/**
 * Creates a styler instance configured with color capability.
 *
 * @param {boolean} enabled - Whether colors are enabled
 */
export function createStyler(enabled) {
  const style = (openCode, text) => {
    if (!enabled || text === '' || text === null || text === undefined) {
      return String(text ?? '');
    }
    return `${openCode}${text}${ANSI_CODES.reset}`;
  };

  return {
    enabled,
    bold: (text) => style(ANSI_CODES.bold, text),
    dim: (text) => style(ANSI_CODES.dim, text),
    italic: (text) => style(ANSI_CODES.italic, text),
    underline: (text) => style(ANSI_CODES.underline, text),
    red: (text) => style(ANSI_CODES.red, text),
    green: (text) => style(ANSI_CODES.green, text),
    yellow: (text) => style(ANSI_CODES.yellow, text),
    blue: (text) => style(ANSI_CODES.blue, text),
    magenta: (text) => style(ANSI_CODES.magenta, text),
    cyan: (text) => style(ANSI_CODES.cyan, text),
    white: (text) => style(ANSI_CODES.white, text),
    gray: (text) => style(ANSI_CODES.gray, text),
    badge: (label, colorFn) => style(ANSI_CODES.bold, `[${label}]`)
  };
}

/**
 * Serializes an object to formatted JSON.
 *
 * @param {unknown} data
 * @returns {string}
 */
export function formatJson(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Formats an error for console output.
 *
 * @param {Error|unknown} err
 * @param {ReturnType<createStyler>} styler
 * @returns {string}
 */
export function formatError(err, styler) {
  const prefix = styler.red(styler.bold('error:'));
  const message = err instanceof Error ? err.message : String(err);
  return `${prefix} ${message}`;
}
