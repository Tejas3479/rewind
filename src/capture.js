import { spawn } from 'node:child_process';
import { readGitMetadata } from './git.js';
import { captureSafeEnvironment } from './environment.js';
import { sanitizeOutput } from './sanitizer.js';
import { SpawnError } from './errors.js';

/**
 * Execution and capture result record.
 * @typedef {object} CaptureRecord
 * @property {string} command - Target executable/command
 * @property {string[]} args - Target arguments
 * @property {string} fullCommand - Combined command line string
 * @property {string} cwd - Working directory at execution time
 * @property {string} startTime - ISO timestamp at process start
 * @property {string} endTime - ISO timestamp at process completion
 * @property {number} durationMs - Execution time in milliseconds
 * @property {number|null} exitCode - Exit code (0 for success, non-zero for failure)
 * @property {string|null} signal - Termination signal (e.g. SIGTERM) if killed
 * @property {boolean} success - Whether process exited with code 0 and no signal
 * @property {string} stdoutRaw - Exact raw stdout buffer converted to UTF-8
 * @property {string} stderrRaw - Exact raw stderr buffer converted to UTF-8
 * @property {string} stdout - Sanitized plain-text stdout
 * @property {string} stderr - Sanitized plain-text stderr
 * @property {import('./git.js').GitMetadata} git - Repository HEAD metadata
 * @property {object} environment - Safe platform and environment metadata
 */

/**
 * Executes a child process, streams its output live, and captures all lifecycle,
 * output, git, and environment diagnostic evidence.
 *
 * @param {string[]} commandTokens - Command and arguments array (e.g. ['npm', 'test'])
 * @param {object} [options]
 * @param {string} [options.cwd=process.cwd()] - Working directory
 * @param {Record<string, string>} [options.env=process.env] - Process environment
 * @param {NodeJS.WritableStream|null} [options.stdoutStream] - Stream to pipe live stdout to
 * @param {NodeJS.WritableStream|null} [options.stderrStream] - Stream to pipe live stderr to
 * @param {boolean} [options.shell=false] - Whether to spawn inside a shell
 * @param {number} [options.timeout] - Process execution timeout in ms
 * @returns {Promise<CaptureRecord>}
 */
export async function executeAndCapture(commandTokens, options = {}) {
  if (!commandTokens || !Array.isArray(commandTokens) || commandTokens.length === 0) {
    throw new SpawnError('No command specified for execution.');
  }

  const [executable, ...args] = commandTokens;
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const stdoutStream = options.stdoutStream || null;
  const stderrStream = options.stderrStream || null;
  const useShell = options.shell !== undefined ? Boolean(options.shell) : false;

  const startTimeIso = new Date().toISOString();
  const startHrTime = process.hrtime.bigint();

  const stdoutChunks = [];
  const stderrChunks = [];

  return new Promise((resolve, reject) => {
    let childProcess;
    try {
      childProcess = spawn(executable, args, {
        cwd,
        env,
        shell: useShell,
        stdio: ['inherit', 'pipe', 'pipe'],
        timeout: options.timeout
      });
    } catch (err) {
      return reject(new SpawnError(`Failed to spawn command "${executable}": ${err.message}`, { originalError: err.message }));
    }

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (chunk) => {
        stdoutChunks.push(chunk);
        if (stdoutStream && typeof stdoutStream.write === 'function') {
          stdoutStream.write(chunk);
        }
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
        if (stderrStream && typeof stderrStream.write === 'function') {
          stderrStream.write(chunk);
        }
      });
    }

    childProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new SpawnError(`Command not found: "${executable}"`, { code: err.code }));
      } else {
        reject(new SpawnError(`Process error for "${executable}": ${err.message}`, { code: err.code }));
      }
    });

    childProcess.on('close', (exitCode, signal) => {
      const endHrTime = process.hrtime.bigint();
      const endTimeIso = new Date().toISOString();
      const durationMs = Number((endHrTime - startHrTime) / 1_000_000n);

      const stdoutRaw = Buffer.concat(stdoutChunks).toString('utf8');
      const stderrRaw = Buffer.concat(stderrChunks).toString('utf8');

      const stdoutSanitized = sanitizeOutput(stdoutRaw);
      const stderrSanitized = sanitizeOutput(stderrRaw);

      // Safe git and environment metadata
      const gitMetadata = readGitMetadata(cwd);
      const safeEnv = captureSafeEnvironment(env);

      /** @type {CaptureRecord} */
      const record = {
        command: executable,
        args,
        fullCommand: commandTokens.join(' '),
        cwd,
        startTime: startTimeIso,
        endTime: endTimeIso,
        durationMs,
        exitCode: exitCode !== null ? exitCode : (signal ? 128 : 1),
        signal: signal || null,
        success: exitCode === 0 && signal === null,
        stdoutRaw,
        stderrRaw,
        stdout: stdoutSanitized,
        stderr: stderrSanitized,
        git: gitMetadata,
        environment: safeEnv
      };

      resolve(record);
    });
  });
}
