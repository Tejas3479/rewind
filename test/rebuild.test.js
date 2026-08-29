import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StorageEngine } from '../src/storage/store.js';

describe('Projection Rebuild & Disposable Derived State (rewind rebuild)', () => {
  let tempDir;
  let ledgerDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-rebuild-test-'));
    ledgerDir = path.join(tempDir, '.rewind');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('reconstructs all derived incident files when records/ directory is wiped', () => {
    const storage = new StorageEngine(ledgerDir);
    storage.init();

    // Create 3 incidents with recoveries and verification
    const rec1 = storage.saveRecord({
      command: 'npm',
      args: ['test'],
      exitCode: 1,
      stderr: 'Test 1 failed',
      cwd: tempDir
    });

    storage.addRecoveryAttempt(rec1.id, {
      cause: 'Missing environment variable',
      change: 'Added DB_PORT=5432',
      verifyCmd: 'npm test'
    });

    storage.recordVerificationRun(rec1.id, 1, {
      command: 'npm test',
      exitCode: 0,
      durationMs: 120,
      output: 'All tests passed'
    });

    const rec2 = storage.saveRecord({
      command: 'cargo',
      args: ['build'],
      exitCode: 1,
      stderr: 'Compilation error',
      cwd: tempDir
    });

    // Verify records exist on disk
    const recordsDir = path.join(ledgerDir, 'records');
    assert.ok(fs.existsSync(path.join(recordsDir, '1.json')));
    assert.ok(fs.existsSync(path.join(recordsDir, '2.json')));

    // Wipe out records directory completely
    fs.rmSync(recordsDir, { recursive: true, force: true });
    assert.strictEqual(fs.existsSync(recordsDir), false);

    // Run rebuild
    const result = storage.rebuildProjections();

    assert.strictEqual(result.incidentsDerived, 2);
    assert.ok(fs.existsSync(path.join(recordsDir, '1.json')));
    assert.ok(fs.existsSync(path.join(recordsDir, '2.json')));

    // Check that incident 1 state is correctly recovered with attempts and verification runs
    const restored1 = storage.getRecord('1');
    assert.strictEqual(restored1.status, 'RECOVERED');
    assert.strictEqual(restored1.recoveryAttempts.length, 1);
    assert.strictEqual(restored1.recoveryAttempts[0].status, 'VERIFIED');
    assert.strictEqual(restored1.recoveryAttempts[0].verificationRuns.length, 1);
    assert.strictEqual(restored1.recoveryAttempts[0].verificationRuns[0].result, 'PASSED');
  });

  it('leaves authoritative journal completely untouched during rebuild', () => {
    const storage = new StorageEngine(ledgerDir);
    storage.init();

    storage.saveRecord({ command: 'node', exitCode: 1, stderr: 'err', cwd: tempDir });

    const journalPath = path.join(ledgerDir, 'journal.jsonl');
    const beforeContent = fs.readFileSync(journalPath, 'utf8');
    const beforeStat = fs.statSync(journalPath);

    storage.rebuildProjections();

    const afterContent = fs.readFileSync(journalPath, 'utf8');
    const afterStat = fs.statSync(journalPath);

    assert.strictEqual(beforeContent, afterContent);
    assert.strictEqual(beforeStat.mtimeMs, afterStat.mtimeMs);
  });
});
