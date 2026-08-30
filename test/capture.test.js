import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { executeAndCapture } from '../src/capture.js';
import { SpawnError } from '../src/errors.js';

describe('Command Capture Engine (src/capture.js)', () => {
  test('executes successful command and captures lifecycle, output, and exit code 0', async () => {
    const result = await executeAndCapture([
      process.execPath,
      '-e',
      'console.log("hello from child stdout")'
    ]);

    assert.equal(result.command, process.execPath);
    assert.equal(result.exitCode, 0);
    assert.equal(result.success, true);
    assert.equal(result.signal, null);
    assert.ok(result.stdout.includes('hello from child stdout'));
    assert.equal(result.stderr.trim(), '');
    assert.ok(result.durationMs >= 0);
    assert.ok(result.startTime);
    assert.ok(result.endTime);
    assert.ok(result.git);
    assert.ok(result.environment);
  });

  test('executes failing command and captures non-zero exit code and stderr', async () => {
    const result = await executeAndCapture([
      process.execPath,
      '-e',
      'console.error("fatal failure test"); process.exit(42);'
    ]);

    assert.equal(result.exitCode, 42);
    assert.equal(result.success, false);
    assert.ok(result.stderr.includes('fatal failure test'));
  });

  test('handles empty stdout and stderr properly', async () => {
    const result = await executeAndCapture([
      process.execPath,
      '-e',
      '/* noop */'
    ]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.success, true);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });

  test('executes command with complex arguments and flags', async () => {
    const result = await executeAndCapture([
      process.execPath,
      '-e',
      'console.log(process.argv.slice(1).join(","))',
      'arg1',
      'arg 2 with spaces',
      '--flag=value'
    ]);

    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('arg1,arg 2 with spaces,--flag=value'));
  });

  test('streams stdout and stderr live when streams are provided', async () => {
    let capturedStdout = '';
    let capturedStderr = '';

    const stdoutStream = {
      write: (chunk) => {
        capturedStdout += chunk;
      }
    };
    const stderrStream = {
      write: (chunk) => {
        capturedStderr += chunk;
      }
    };

    const result = await executeAndCapture(
      [
        process.execPath,
        '-e',
        'console.log("live stdout"); console.error("live stderr");'
      ],
      { stdoutStream, stderrStream }
    );

    assert.equal(result.exitCode, 0);
    assert.ok(capturedStdout.includes('live stdout'));
    assert.ok(capturedStderr.includes('live stderr'));
  });

  test('throws SpawnError for non-existent command or binary', async () => {
    await assert.rejects(
      async () => executeAndCapture(['this-executable-definitely-does-not-exist-12345']),
      (err) => {
        assert.ok(err instanceof SpawnError || err.name === 'SpawnError');
        return true;
      }
    );
  });

  test('executes shell compound commands when shell option is enabled', async () => {
    const result = await executeAndCapture(
      [`"${process.execPath}" -e "process.stdout.write('A')" && "${process.execPath}" -e "process.stdout.write('B')"`],
      { shell: true }
    );

    assert.equal(result.exitCode, 0);
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('AB'));
  });

  test('preserves FORCE_COLOR in child environment when appropriate', async () => {
    const result = await executeAndCapture(
      [process.execPath, '-e', 'console.log(process.env.FORCE_COLOR || "NONE")'],
      { env: { ...process.env, FORCE_COLOR: '1' } }
    );

    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('1'));
  });
});
