import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runCLI } from '../src/cli.js';
import { redactSecrets, sanitizeOutput } from '../src/sanitizer.js';
import { captureSafeEnvironment } from '../src/environment.js';
import { executeAndCapture } from '../src/capture.js';

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

describe('Security & Privacy Hardening (test/security.test.js)', () => {
  describe('Path Traversal & ID Sanitization', () => {
    test('rejects path traversal attempts in show command', async () => {
      const mock1 = createMockIO();
      const code1 = await runCLI(['show', '../../etc/passwd'], mock1.io);
      assert.equal(code1, 1);
      assert.ok(mock1.getStderr().includes('Incident #../../etc/passwd not found in ledger'));

      const mock2 = createMockIO();
      const code2 = await runCLI(['show', '1/../../../etc'], mock2.io);
      assert.equal(code2, 1);
    });

    test('rejects path traversal attempts in recover command', async () => {
      const mock = createMockIO();
      const code = await runCLI(['recover', '../../1', '--cause', 'hack'], mock.io);
      assert.equal(code, 1);
    });

    test('rejects path traversal attempts in verify command', async () => {
      const mock = createMockIO();
      const code = await runCLI(['verify', '../1'], mock.io);
      assert.equal(code, 1);
    });
  });

  describe('Secret Redaction Engine', () => {
    test('redacts OpenAI API keys', () => {
      const mockKey = ['sk', 'proj', 'mockexampletoken12345678901234'].join('-');
      const input = `Failed with OpenAI key ${mockKey} in config`;
      const output = redactSecrets(input);
      assert.ok(!output.includes(mockKey));
      assert.ok(output.includes('[REDACTED_API_KEY]'));
    });

    test('redacts GitHub personal access tokens', () => {
      const mockToken = ['ghp', 'mockexamplegithubtoken1234567890'].join('_');
      const input = `Auth error: ${mockToken} is invalid`;
      const output = redactSecrets(input);
      assert.ok(!output.includes(mockToken));
      assert.ok(output.includes('[REDACTED_GITHUB_TOKEN]'));
    });

    test('redacts AWS access keys', () => {
      const mockKey = ['AKIA', '0123456789ABCDEF'].join('');
      const input = `AWS credentials: ${mockKey} rejected`;
      const output = redactSecrets(input);
      assert.ok(!output.includes(mockKey));
      assert.ok(output.includes('[REDACTED_AWS_KEY]'));
    });

    test('redacts Slack tokens', () => {
      const mockToken = ['xoxb', '000000000000', 'mockslacktoken12345678'].join('-');
      const input = `Webhook failed with token ${mockToken}`;
      const output = redactSecrets(input);
      assert.ok(!output.includes(mockToken));
      assert.ok(output.includes('[REDACTED_SLACK_TOKEN]'));
    });

    test('redacts Bearer authorization tokens', () => {
      const mockJwt = ['Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'mockpayload', 'mocksignature'].join('.');
      const input = `Header: Authorization: ${mockJwt}`;
      const output = redactSecrets(input);
      assert.ok(!output.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
      assert.ok(output.includes('Bearer [REDACTED]'));
    });

    test('redacts PEM private key blocks', () => {
      const input = 'Loaded key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----\nDone.';
      const output = redactSecrets(input);
      assert.ok(!output.includes('MIIEowIBAAKCAQEA0'));
      assert.ok(output.includes('[REDACTED_PRIVATE_KEY]'));
    });

    test('redacts Basic Auth credentials in URLs', () => {
      const input = 'Error connecting to https://admin:superSecretPassword123@db.internal:5432/main';
      const output = redactSecrets(input);
      assert.ok(!output.includes('admin:superSecretPassword123'));
      assert.ok(output.includes('https://[REDACTED]@db.internal:5432/main'));
    });

    test('redacts password key-value parameters', () => {
      const input = 'Connection string: host=localhost;password="superSecret999";user=app';
      const output = redactSecrets(input);
      assert.ok(!output.includes('superSecret999'));
      assert.ok(output.includes('password=[REDACTED]'));
    });
  });

  describe('Terminal Safety & Anti-ANSI Injection', () => {
    test('neutralizes OSC terminal hyperlinks and cursor jumps', () => {
      const malicious = '\x1B]8;;https://malicious-site.com\x07Click here\x1B]8;;\x07 \x1B[2J\x1B[H';
      const sanitized = sanitizeOutput(malicious);
      assert.ok(!sanitized.includes('\x1B'));
      assert.ok(!sanitized.includes('\x07'));
      assert.equal(sanitized.trim(), 'Click here');
    });

    test('strips dangerous non-printable ASCII control characters', () => {
      const malicious = 'Normal text\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0B\x0C\x0E\x1F\x7F';
      const sanitized = sanitizeOutput(malicious);
      assert.equal(sanitized, 'Normal text');
    });
  });

  describe('Privacy & Environment Key Isolation', () => {
    test('never stores sensitive environment variable values', () => {
      const rawEnv = {
        PATH: '/usr/bin',
        NODE_ENV: 'production',
        AWS_SECRET_ACCESS_KEY: 'mockSecretAccessKeyExampleValue',
        GITHUB_TOKEN: 'mockGithubTokenValue1234567890',
        DATABASE_PASSWORD: 'superSecretDatabasePassword'
      };

      const safe = captureSafeEnvironment(rawEnv);
      assert.equal(safe.totalEnvVars, 5);
      // Key names are recorded
      assert.ok(safe.envKeys.includes('AWS_SECRET_ACCESS_KEY'));
      assert.ok(safe.envKeys.includes('GITHUB_TOKEN'));
      assert.ok(safe.envKeys.includes('DATABASE_PASSWORD'));

      // Sensitive values are NEVER stored in safeValues
      assert.equal(safe.safeValues.AWS_SECRET_ACCESS_KEY, undefined);
      assert.equal(safe.safeValues.GITHUB_TOKEN, undefined);
      assert.equal(safe.safeValues.DATABASE_PASSWORD, undefined);

      // Only allowlisted non-sensitive keys have values
      assert.equal(safe.safeValues.NODE_ENV, 'production');
    });
  });

  describe('Resource Exhaustion Protection', () => {
    test('caps stream buffers at configured memory limit', async () => {
      const result = await executeAndCapture([
        process.execPath,
        '-e',
        'for (let i = 0; i < 500; i++) { console.log("A".repeat(100)); }'
      ], {
        maxBufferBytes: 2048 // 2KB test cap
      });

      assert.ok(result.stdoutRaw.length < 5000);
      assert.ok(result.stdoutRaw.includes('[rewind: output truncated after 10MB limit]'));
    });
  });
});
