import os from 'node:os';

/**
 * List of known non-secret environment variable names whose values
 * are safe to capture for diagnostic reproduction.
 */
export const SAFE_VALUE_ALLOWLIST = new Set([
  'NODE_ENV',
  'CI',
  'LANG',
  'LC_ALL',
  'TZ',
  'TERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'COLORTERM'
]);

/**
 * Captures safe environment and platform diagnostic metadata without persisting
 * raw environment variable values or sensitive credentials.
 *
 * @param {Record<string, string>} [env=process.env]
 * @returns {object} Safe environment metadata
 */
export function captureSafeEnvironment(env = process.env) {
  const allKeys = Object.keys(env).sort();
  const safeValues = {};

  for (const key of allKeys) {
    if (SAFE_VALUE_ALLOWLIST.has(key)) {
      safeValues[key] = String(env[key]);
    }
  }

  return {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    nodeVersion: process.version,
    totalEnvVars: allKeys.length,
    envKeys: allKeys,
    safeValues
  };
}
