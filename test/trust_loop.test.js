import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { runCLI } from '../src/cli.js';
import { StorageEngine } from '../src/storage/store.js';
import { RecoveryStates, isValidTransition } from '../src/storage/state.js';

function createMockIO({ env = {}, isTTY = false, cwd = process.cwd() } = {}) {
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
      cwd
    },
    getStdout: () => stdoutData,
    getStderr: () => stderrData
  };
}

describe('Trust Loop State Machine & Verification (src/storage/state.js)', () => {
  test('validates legal and illegal state transitions', () => {
    // Valid transitions
    assert.equal(isValidTransition(RecoveryStates.OBSERVED, RecoveryStates.SUSPECTED), true);
    assert.equal(isValidTransition(RecoveryStates.OBSERVED, RecoveryStates.FIXED), true);
    assert.equal(isValidTransition(RecoveryStates.SUSPECTED, RecoveryStates.FIXED), true);
    assert.equal(isValidTransition(RecoveryStates.FIXED, RecoveryStates.VERIFIED), true);
    assert.equal(isValidTransition(RecoveryStates.VERIFIED, RecoveryStates.REGRESSED), true);
    assert.equal(isValidTransition(RecoveryStates.REGRESSED, RecoveryStates.FIXED), true);

    // Illegal transitions
    assert.equal(isValidTransition(RecoveryStates.OBSERVED, RecoveryStates.VERIFIED), false);
    assert.equal(isValidTransition(RecoveryStates.VERIFIED, RecoveryStates.SUSPECTED), false);
    assert.equal(isValidTransition(RecoveryStates.VERIFIED, RecoveryStates.FIXED), false);
  });

  test('executes complete Trust Loop: OBSERVED -> SUSPECTED -> FIXED -> VERIFIED -> REGRESSED', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-loop-test-'));
    try {
      const rootFlag = `--root=${tmpDir}`;
      const store = new StorageEngine(path.join(tmpDir, '.rewind'));

      // Step 1: Run failing command -> creates Incident #1 (OBSERVED)
      const mock1 = createMockIO({ cwd: tmpDir });
      const code1 = await runCLI([rootFlag, 'run', process.execPath, '-e', 'console.error("Crash in auth handler"); process.exit(1);'], mock1.io);
      assert.equal(code1, 1);

      store.init();
      const inc1 = store.getRecord('1');
      assert.ok(inc1);
      assert.equal(inc1.id, '1');
      assert.equal(inc1.status, RecoveryStates.OBSERVED);
      assert.ok(inc1.fingerprint);

      // Step 2: Record suspected cause -> transitions to SUSPECTED
      const mock2 = createMockIO({ cwd: tmpDir });
      const code2 = await runCLI([rootFlag, 'recover', '1', '--cause', 'Token validation failed'], mock2.io);
      assert.equal(code2, 0);

      store.rebuildIndex();
      const inc1Suspected = store.getRecord('1');
      assert.equal(inc1Suspected.status, RecoveryStates.SUSPECTED);
      assert.equal(inc1Suspected.recoveries.length, 1);
      assert.equal(inc1Suspected.recoveries[0].cause, 'Token validation failed');

      // Step 3: Record change and explicit verification command -> transitions to FIXED
      const mock3 = createMockIO({ cwd: tmpDir });
      const code3 = await runCLI([
        rootFlag,
        'recover',
        '1',
        '--change',
        'Added missing token check',
        '--verify-cmd',
        `"${process.execPath}" -e "process.exit(0);"`
      ], mock3.io);
      assert.equal(code3, 0);

      store.rebuildIndex();
      const inc1Fixed = store.getRecord('1');
      assert.equal(inc1Fixed.status, RecoveryStates.FIXED);
      assert.equal(inc1Fixed.recoveries.length, 2);
      assert.equal(inc1Fixed.recoveries[1].change, 'Added missing token check');

      // Step 4: Execute rewind verify 1 -> transitions to VERIFIED
      const mock4 = createMockIO({ cwd: tmpDir });
      const code4 = await runCLI([rootFlag, 'verify', '1'], mock4.io);
      assert.equal(code4, 0);

      store.rebuildIndex();
      const inc1Verified = store.getRecord('1');
      assert.equal(inc1Verified.status, RecoveryStates.VERIFIED);
      assert.ok(inc1Verified.verification);
      assert.equal(inc1Verified.verification.exitCode, 0);

      // Step 5: Reproduce the identical failure -> creates Incident #2 marked as REGRESSED
      const mock5 = createMockIO({ cwd: tmpDir });
      const code5 = await runCLI([rootFlag, 'run', process.execPath, '-e', 'console.error("Crash in auth handler"); process.exit(1);'], mock5.io);
      assert.equal(code5, 1);

      store.rebuildIndex();
      const inc2 = store.getRecord('2');
      assert.ok(inc2);
      assert.equal(inc2.id, '2');
      assert.equal(inc2.status, RecoveryStates.REGRESSED);
      assert.equal(inc2.regressionOf, '1');
      assert.equal(inc2.fingerprint, inc1.fingerprint);
      assert.ok(mock5.getStderr().includes('REGRESSION'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rewind verify fails when verification command exits non-zero', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-verify-fail-'));
    try {
      const rootFlag = `--root=${tmpDir}`;

      // 1. Create failure
      const mock1 = createMockIO({ cwd: tmpDir });
      await runCLI([rootFlag, 'run', process.execPath, '-e', 'console.error("DB down"); process.exit(1);'], mock1.io);

      // 2. Record fix with a verification command that will FAIL
      const mock2 = createMockIO({ cwd: tmpDir });
      await runCLI([
        rootFlag,
        'recover',
        '1',
        '--cause',
        'Bad port',
        '--change',
        'Port 5432',
        '--verify-cmd',
        `"${process.execPath}" -e "console.error('Still down'); process.exit(44);"`
      ], mock2.io);

      // 3. Attempt verification
      const mock3 = createMockIO({ cwd: tmpDir });
      const verifyExitCode = await runCLI([rootFlag, 'verify', '1'], mock3.io);

      assert.equal(verifyExitCode, 44);
      assert.ok(mock3.getStderr().includes('NOT VERIFIED'));

      const store = new StorageEngine(path.join(tmpDir, '.rewind')).init();
      const record = store.getRecord('1');
      assert.equal(record.status, RecoveryStates.FIXED); // Did NOT promote to VERIFIED
      assert.equal(record.verification.passed, false);
      assert.equal(record.verification.exitCode, 44);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rejects verifying an unknown incident ID', async () => {
    const mock = createMockIO();
    const exitCode = await runCLI(['verify', '99999'], mock.io);
    assert.equal(exitCode, 1);
    assert.ok(mock.getStderr().includes('Incident #99999 not found'));
  });

  test('rejects verifying an incident with no stored verification command', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-no-cmd-'));
    try {
      const rootFlag = `--root=${tmpDir}`;
      const mock1 = createMockIO({ cwd: tmpDir });
      await runCLI([rootFlag, 'run', process.execPath, '-e', 'console.error("err"); process.exit(1);'], mock1.io);

      // Try verify directly without recover
      const mock2 = createMockIO({ cwd: tmpDir });
      const code = await runCLI([rootFlag, 'verify', '1'], mock2.io);
      assert.equal(code, 2);
      assert.ok(mock2.getStderr().includes('has no explicit verification command recorded'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rejects verifying an already VERIFIED incident', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-double-verify-'));
    try {
      const rootFlag = `--root=${tmpDir}`;
      const mock1 = createMockIO({ cwd: tmpDir });
      await runCLI([rootFlag, 'run', process.execPath, '-e', 'console.error("err"); process.exit(1);'], mock1.io);

      const mock2 = createMockIO({ cwd: tmpDir });
      await runCLI([rootFlag, 'recover', '1', '--change', 'fix', '--verify-cmd', `"${process.execPath}" -e "process.exit(0);"`], mock2.io);

      const mock3 = createMockIO({ cwd: tmpDir });
      const code3 = await runCLI([rootFlag, 'verify', '1'], mock3.io);
      assert.equal(code3, 0);

      // Try verify again
      const mock4 = createMockIO({ cwd: tmpDir });
      const code4 = await runCLI([rootFlag, 'verify', '1'], mock4.io);
      assert.equal(code4, 2);
      assert.ok(mock4.getStderr().includes('is already in state VERIFIED'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
