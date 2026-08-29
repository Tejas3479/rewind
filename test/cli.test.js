import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runCLI } from '../src/cli.js';
import { ExitCodes } from '../src/errors.js';

/**
 * Helper to capture stdout/stderr in test runs.
 */
function createMockIO({ env = {}, isTTY = false } = {}) {
  let stdoutData = '';
  let stderrData = '';

  const stdout = {
    write: (chunk) => {
      stdoutData += chunk;
      return true;
    }
  };

  const stderr = {
    write: (chunk) => {
      stderrData += chunk;
      return true;
    }
  };

  return {
    io: {
      stdout,
      stderr,
      stdin: {},
      env,
      isTTY,
      cwd: process.cwd()
    },
    getStdout: () => stdoutData,
    getStderr: () => stderrData
  };
}

describe('CLI Integration & Behaviors (src/cli.js)', () => {
  test('rewind (no args) displays help on stdout with exit code 0', async () => {
    const { io, getStdout, getStderr } = createMockIO();
    const exitCode = await runCLI([], io);

    assert.equal(exitCode, ExitCodes.SUCCESS);
    assert.ok(getStdout().includes('REWIND — Remember what fixed it.'));
    assert.ok(getStdout().includes('USAGE:'));
    assert.equal(getStderr(), '');
  });

  test('rewind --help and -h display help on stdout with exit code 0', async () => {
    const mock1 = createMockIO();
    const code1 = await runCLI(['--help'], mock1.io);
    assert.equal(code1, ExitCodes.SUCCESS);
    assert.ok(mock1.getStdout().includes('USAGE:'));
    assert.equal(mock1.getStderr(), '');

    const mock2 = createMockIO();
    const code2 = await runCLI(['-h'], mock2.io);
    assert.equal(code2, ExitCodes.SUCCESS);
    assert.ok(mock2.getStdout().includes('USAGE:'));
    assert.equal(mock2.getStderr(), '');
  });

  test('rewind help <command> displays command-specific help on stdout with exit code 0', async () => {
    const { io, getStdout, getStderr } = createMockIO();
    const exitCode = await runCLI(['help', 'run'], io);

    assert.equal(exitCode, ExitCodes.SUCCESS);
    assert.ok(getStdout().includes('REWIND RUN'));
    assert.ok(getStdout().includes('rewind run <command...>'));
    assert.equal(getStderr(), '');
  });

  test('rewind --version and -v display version on stdout with exit code 0', async () => {
    const mock1 = createMockIO();
    const code1 = await runCLI(['--version'], mock1.io);
    assert.equal(code1, ExitCodes.SUCCESS);
    assert.equal(mock1.getStdout().trim(), 'rewind v0.1.0');
    assert.equal(mock1.getStderr(), '');

    const mock2 = createMockIO();
    const code2 = await runCLI(['-v'], mock2.io);
    assert.equal(code2, ExitCodes.SUCCESS);
    assert.equal(mock2.getStdout().trim(), 'rewind v0.1.0');
    assert.equal(mock2.getStderr(), '');
  });

  test('rewind --version --json outputs valid JSON version payload to stdout', async () => {
    const { io, getStdout, getStderr } = createMockIO();
    const exitCode = await runCLI(['--version', '--json'], io);

    assert.equal(exitCode, ExitCodes.SUCCESS);
    const parsed = JSON.parse(getStdout().trim());
    assert.deepEqual(parsed, { name: 'rewind', version: '0.1.0' });
    assert.equal(getStderr(), '');
  });

  test('unknown command returns exit code 2 and writes error to stderr', async () => {
    const { io, getStdout, getStderr } = createMockIO();
    const exitCode = await runCLI(['unknown-subcommand'], io);

    assert.equal(exitCode, ExitCodes.USAGE_ERROR);
    assert.equal(getStdout(), '');
    assert.ok(getStderr().includes('Unknown command: "unknown-subcommand"'));
  });

  test('unknown option returns exit code 2 and writes error to stderr', async () => {
    const { io, getStdout, getStderr } = createMockIO();
    const exitCode = await runCLI(['--invalid-flag'], io);

    assert.equal(exitCode, ExitCodes.USAGE_ERROR);
    assert.equal(getStdout(), '');
    assert.ok(getStderr().includes('Unknown option: "--invalid-flag"'));
  });

  test('missing required arguments return exit code 2 and usage hints on stderr', async () => {
    // rewind run (missing command)
    const runMock = createMockIO();
    const runCode = await runCLI(['run'], runMock.io);
    assert.equal(runCode, ExitCodes.USAGE_ERROR);
    assert.ok(runMock.getStderr().includes('Missing required argument <command>'));

    // rewind show (missing id)
    const showMock = createMockIO();
    const showCode = await runCLI(['show'], showMock.io);
    assert.equal(showCode, ExitCodes.USAGE_ERROR);
    assert.ok(showMock.getStderr().includes('Missing required argument <id>'));

    // rewind recover (missing id)
    const recoverMock = createMockIO();
    const recoverCode = await runCLI(['recover'], recoverMock.io);
    assert.equal(recoverCode, ExitCodes.USAGE_ERROR);
    assert.ok(recoverMock.getStderr().includes('Missing required argument <id>'));

    // rewind verify (missing id)
    const verifyMock = createMockIO();
    const verifyCode = await runCLI(['verify'], verifyMock.io);
    assert.equal(verifyCode, ExitCodes.USAGE_ERROR);
    assert.ok(verifyMock.getStderr().includes('Missing required argument <id>'));
  });

  test('Phase 1 unimplemented commands return exit code 1 with explicit message', async () => {
    // rewind run npm test
    const runMock = createMockIO();
    const runCode = await runCLI(['run', 'npm', 'test'], runMock.io);
    assert.equal(runCode, ExitCodes.FAILURE);
    assert.ok(runMock.getStderr().includes('not yet implemented in Phase 1'));

    // rewind history
    const histMock = createMockIO();
    const histCode = await runCLI(['history'], histMock.io);
    assert.equal(histCode, ExitCodes.FAILURE);
    assert.ok(histMock.getStderr().includes('not yet implemented in Phase 1'));

    // rewind show 42
    const showMock = createMockIO();
    const showCode = await runCLI(['show', '42'], showMock.io);
    assert.equal(showCode, ExitCodes.FAILURE);
    assert.ok(showMock.getStderr().includes('not yet implemented in Phase 1'));
  });

  test('JSON error mode formats error payload as valid JSON on stdout', async () => {
    const { io, getStdout, getStderr } = createMockIO();
    const exitCode = await runCLI(['history', '--json'], io);

    assert.equal(exitCode, ExitCodes.FAILURE);
    assert.equal(getStderr(), ''); // No raw text on stderr in JSON mode
    const parsed = JSON.parse(getStdout().trim());
    assert.equal(parsed.status, 'error');
    assert.equal(parsed.error.code, 'ERR_NOT_IMPLEMENTED');
    assert.equal(parsed.error.exitCode, ExitCodes.FAILURE);
  });

  test('NO_COLOR environment variable disables ANSI escape codes in output', async () => {
    const { io, getStderr } = createMockIO({
      env: { NO_COLOR: '1' },
      isTTY: true
    });
    const exitCode = await runCLI(['invalid-cmd'], io);
    assert.equal(exitCode, ExitCodes.USAGE_ERROR);
    // Ensure no ANSI escape character \x1b is present
    assert.ok(!getStderr().includes('\x1b'));
  });

  test('non-TTY mode disables ANSI escape codes', async () => {
    const { io, getStderr } = createMockIO({
      env: {},
      isTTY: false
    });
    const exitCode = await runCLI(['invalid-cmd'], io);
    assert.equal(exitCode, ExitCodes.USAGE_ERROR);
    assert.ok(!getStderr().includes('\x1b'));
  });
});
