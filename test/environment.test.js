import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { captureSafeEnvironment } from '../src/environment.js';

describe('Environment Privacy & Metadata (src/environment.js)', () => {
  test('redacts raw sensitive variable values while preserving keys', () => {
    const mockEnv = {
      API_KEY: 'secret-12345',
      DATABASE_PASSWORD: 'super-secret-password',
      AWS_SECRET_ACCESS_KEY: 'very-secret',
      NODE_ENV: 'test',
      CI: 'true',
      PATH: '/usr/bin:/bin'
    };

    const result = captureSafeEnvironment(mockEnv);

    // Verify key presence
    assert.equal(result.totalEnvVars, 6);
    assert.ok(result.envKeys.includes('API_KEY'));
    assert.ok(result.envKeys.includes('DATABASE_PASSWORD'));
    assert.ok(result.envKeys.includes('AWS_SECRET_ACCESS_KEY'));

    // Verify safe allowlist values are preserved
    assert.equal(result.safeValues.NODE_ENV, 'test');
    assert.equal(result.safeValues.CI, 'true');

    // Verify sensitive values are NEVER persisted in safeValues
    assert.equal(result.safeValues.API_KEY, undefined);
    assert.equal(result.safeValues.DATABASE_PASSWORD, undefined);
    assert.equal(result.safeValues.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(result.safeValues.PATH, undefined);
  });

  test('captures host platform and runtime version metadata', () => {
    const result = captureSafeEnvironment({});
    assert.equal(result.platform, process.platform);
    assert.equal(result.arch, process.arch);
    assert.equal(result.nodeVersion, process.version);
    assert.ok(result.osRelease);
  });
});
