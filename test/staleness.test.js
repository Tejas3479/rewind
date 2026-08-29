import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStaleness } from '../src/storage/staleness.js';

describe('Relevance-Aware Staleness Engine (src/storage/staleness.js)', () => {
  test('flags STALE on major Node.js runtime version change (v20 to v22)', () => {
    const historicalRecord = {
      id: '1',
      environment: {
        platform: 'win32',
        arch: 'x64',
        nodeVersion: 'v20.10.0',
        nodeMajor: 20,
        envKeys: ['NODE_ENV', 'PORT']
      },
      git: { headCommit: '1111111111111111111111111111111111111111', branch: 'main' },
      recoveryAttempts: [
        { id: 1, status: 'VERIFIED', change: 'Set PORT=5432' }
      ]
    };

    const currentEnv = {
      platform: 'win32',
      arch: 'x64',
      nodeVersion: 'v22.18.0',
      nodeMajor: 22,
      envKeys: ['NODE_ENV', 'PORT']
    };

    const result = evaluateStaleness(historicalRecord, currentEnv);
    assert.equal(result.isStale, true);
    assert.equal(result.level, 'RELEVANT_CHANGE');
    assert.match(result.reasons[0], /Runtime major version changed/);
  });

  test('does NOT flag STALE on minor/patch Node.js version change (v24.19 to v24.20)', () => {
    const historicalRecord = {
      id: '1',
      environment: {
        platform: 'linux',
        arch: 'x64',
        nodeVersion: 'v24.19.0',
        nodeMajor: 24,
        envKeys: ['NODE_ENV']
      },
      git: { headCommit: 'aaaa', branch: 'main' },
      recoveryAttempts: []
    };

    const currentEnv = {
      platform: 'linux',
      arch: 'x64',
      nodeVersion: 'v24.20.0',
      nodeMajor: 24,
      envKeys: ['NODE_ENV']
    };

    const result = evaluateStaleness(historicalRecord, currentEnv);
    assert.equal(result.isStale, false);
    assert.equal(result.level, 'MINOR_CHANGE');
  });

  test('flags STALE when OS platform changes (win32 to linux)', () => {
    const historicalRecord = {
      id: '1',
      environment: {
        platform: 'win32',
        arch: 'x64',
        nodeVersion: 'v22.0.0',
        nodeMajor: 22,
        envKeys: []
      },
      git: {},
      recoveryAttempts: []
    };

    const currentEnv = {
      platform: 'linux',
      arch: 'x64',
      nodeVersion: 'v22.0.0',
      nodeMajor: 22,
      envKeys: []
    };

    const result = evaluateStaleness(historicalRecord, currentEnv);
    assert.equal(result.isStale, true);
    assert.match(result.reasons[0], /OS Platform changed/);
  });

  test('treats Git commit diff as context without false-positive staleness invalidation', () => {
    const historicalRecord = {
      id: '1',
      environment: {
        platform: 'linux',
        arch: 'x64',
        nodeVersion: 'v22.0.0',
        nodeMajor: 22,
        envKeys: []
      },
      git: { headCommit: '1111222233334444555566667777888899990000', branch: 'main' },
      recoveryAttempts: []
    };

    const currentEnv = {
      platform: 'linux',
      arch: 'x64',
      nodeVersion: 'v22.0.0',
      nodeMajor: 22,
      envKeys: []
    };

    const currentGit = {
      headCommit: '9999888877776666555544443333222211110000',
      branch: 'feature/unrelated-docs'
    };

    const result = evaluateStaleness(historicalRecord, currentEnv, currentGit);
    assert.equal(result.isStale, false); // Still valid!
    assert.equal(result.diffs.git.diverged, true); // But divergence recorded in diffs context
  });
});
