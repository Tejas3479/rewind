import os from 'node:os';
import crypto from 'node:crypto';

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
 * @typedef {object} EnvironmentSnapshot
 * @property {string} platform
 * @property {string} arch
 * @property {string} osRelease
 * @property {string} nodeVersion
 * @property {number} nodeMajor
 * @property {number} totalEnvVars
 * @property {string[]} envKeys
 * @property {string} envKeysHash
 * @property {Record<string, string>} safeValues
 * @property {string} fingerprint
 */

/**
 * Computes a deterministic 16-character SHA-256 fingerprint for an environment snapshot.
 *
 * @param {object} snapshot
 * @returns {string}
 */
export function computeEnvironmentFingerprint(snapshot) {
  const payload = [
    snapshot.platform || '',
    snapshot.arch || '',
    snapshot.nodeMajor !== undefined ? String(snapshot.nodeMajor) : '',
    snapshot.envKeysHash || ''
  ].join('|');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Captures safe environment and platform diagnostic metadata without persisting
 * raw environment variable values or sensitive credentials.
 *
 * @param {Record<string, string>} [env=process.env]
 * @returns {EnvironmentSnapshot} Safe environment metadata
 */
export function captureSafeEnvironment(env = process.env) {
  const allKeys = Object.keys(env).sort();
  const safeValues = {};

  for (const key of allKeys) {
    if (SAFE_VALUE_ALLOWLIST.has(key)) {
      safeValues[key] = String(env[key]);
    }
  }

  const nodeVersion = process.version;
  const majorMatch = nodeVersion.match(/^v?(\d+)/);
  const nodeMajor = majorMatch ? Number.parseInt(majorMatch[1], 10) : 0;

  const envKeysHash = crypto
    .createHash('sha256')
    .update(allKeys.join(','), 'utf8')
    .digest('hex')
    .slice(0, 16);

  const baseSnapshot = {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    nodeVersion,
    nodeMajor,
    totalEnvVars: allKeys.length,
    envKeys: allKeys,
    envKeysHash,
    safeValues
  };

  return {
    ...baseSnapshot,
    fingerprint: computeEnvironmentFingerprint(baseSnapshot)
  };
}

