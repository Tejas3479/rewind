import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LEDGER_DIR = '.rewind';
export const VERSION = '0.1.0';

/**
 * Searches upward from startDir to locate the project root or .rewind directory.
 *
 * Priority:
 * 1. Nearest ancestor containing an existing `.rewind` directory.
 * 2. Nearest ancestor containing a `.git` repository directory.
 * 3. Fallback to startDir.
 *
 * @param {string} startDir - Directory to start searching from
 * @returns {string} - Discovered root path
 */
export function findProjectRoot(startDir = process.cwd()) {
  const normalizedStart = path.resolve(startDir);
  let current = normalizedStart;

  // 1. Search for existing .rewind ledger
  while (true) {
    const rewindDir = path.join(current, DEFAULT_LEDGER_DIR);
    if (fs.existsSync(rewindDir)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 2. Search for git root marker
  current = normalizedStart;
  while (true) {
    const gitDir = path.join(current, '.git');
    if (fs.existsSync(gitDir)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 3. Fallback to startDir
  return normalizedStart;
}

/**
 * Resolves the effective project root and ledger path given CLI options and environment.
 *
 * @param {object} [options]
 * @param {string|null} [options.cliRoot] - Explicit --root flag
 * @param {Record<string, string>} [options.env=process.env] - Environment variables
 * @param {string} [options.cwd=process.cwd()] - Current working directory
 * @returns {{ rootDir: string, ledgerDir: string, version: string }}
 */
export function resolveConfig({ cliRoot = null, env = process.env, cwd = process.cwd() } = {}) {
  let rootDir;

  if (cliRoot) {
    rootDir = path.resolve(cwd, cliRoot);
  } else if (env.REWIND_ROOT) {
    rootDir = path.resolve(cwd, env.REWIND_ROOT);
  } else {
    rootDir = findProjectRoot(cwd);
  }

  const ledgerDir = path.join(rootDir, DEFAULT_LEDGER_DIR);

  return {
    rootDir,
    ledgerDir,
    version: VERSION
  };
}
