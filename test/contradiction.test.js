import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvidenceConflicts } from '../src/storage/contradiction.js';

describe('Contradiction vs Divergence Engine (src/storage/contradiction.js)', () => {
  test('flags CONTRADICTED on same verify command + equivalent environment + conflicting outcome', () => {
    const fingerprint = 'abcd1234abcd1234';

    const records = [
      {
        id: '1',
        fingerprint,
        environment: { platform: 'linux', nodeMajor: 22, fingerprint: 'env1' },
        recoveryAttempts: [
          {
            id: 1,
            status: 'VERIFIED',
            verifyCmd: 'npm run test:db',
            verificationRuns: [
              {
                id: 1,
                command: 'npm run test:db',
                exitCode: 0,
                result: 'PASSED',
                completedAt: '2026-08-20T10:00:00Z',
                environmentFingerprint: 'env1'
              }
            ]
          }
        ]
      },
      {
        id: '2',
        fingerprint,
        environment: { platform: 'linux', nodeMajor: 22, fingerprint: 'env1' },
        recoveryAttempts: [
          {
            id: 1,
            status: 'FAILED',
            verifyCmd: 'npm run test:db',
            verificationRuns: [
              {
                id: 1,
                command: 'npm run test:db',
                exitCode: 1,
                result: 'FAILED',
                completedAt: '2026-08-25T10:00:00Z',
                environmentFingerprint: 'env1'
              }
            ]
          }
        ]
      }
    ];

    const report = analyzeEvidenceConflicts(fingerprint, records);
    assert.equal(report.hasConflicts, true);
    assert.equal(report.classification, 'CONTRADICTED');
    assert.equal(report.conflicts[0].type, 'CONTRADICTED');
    assert.match(report.conflicts[0].description, /succeeded in Incident #1 but failed in Incident #2/);
  });

  test('flags DIVERGENT_EVIDENCE when conflicting outcomes occurred across different platforms', () => {
    const fingerprint = 'abcd1234abcd1234';

    const records = [
      {
        id: '1',
        fingerprint,
        environment: { platform: 'linux', nodeMajor: 22 },
        recoveryAttempts: [
          {
            id: 1,
            status: 'VERIFIED',
            verifyCmd: 'make test',
            verificationRuns: [{ id: 1, command: 'make test', exitCode: 0, result: 'PASSED', completedAt: '2026-08-20T10:00:00Z' }]
          }
        ]
      },
      {
        id: '2',
        fingerprint,
        environment: { platform: 'win32', nodeMajor: 22 },
        recoveryAttempts: [
          {
            id: 1,
            status: 'FAILED',
            verifyCmd: 'make test',
            verificationRuns: [{ id: 1, command: 'make test', exitCode: 1, result: 'FAILED', completedAt: '2026-08-25T10:00:00Z' }]
          }
        ]
      }
    ];

    const report = analyzeEvidenceConflicts(fingerprint, records);
    assert.equal(report.hasConflicts, true);
    assert.equal(report.classification, 'DIVERGENT_EVIDENCE');
    assert.equal(report.conflicts[0].type, 'DIVERGENT_EVIDENCE');
    assert.match(report.conflicts[0].description, /OS platform/);
  });
});
