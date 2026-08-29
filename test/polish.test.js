import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStyler, formatRelativeTime, formatStatusBadge, formatBox } from '../src/formatter.js';
import { runCLI } from '../src/cli.js';

function createMockIO({ env = {}, isTTY = false, cwd = process.cwd(), columns = 80 } = {}) {
  let stdoutData = '';
  let stderrData = '';

  const stdout = {
    columns,
    write: (chunk) => {
      stdoutData += chunk;
      return true;
    }
  };

  const stderr = {
    columns,
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

describe('Product Polish & Visual Hierarchy (test/polish.test.js)', () => {
  describe('Relative Time Formatter', () => {
    const base = new Date('2026-08-29T12:00:00.000Z');

    test('formats recent times accurately', () => {
      assert.equal(formatRelativeTime(new Date(base.getTime() - 20 * 1000).toISOString(), base), 'just now');
      assert.equal(formatRelativeTime(new Date(base.getTime() - 75 * 1000).toISOString(), base), '1m ago');
      assert.equal(formatRelativeTime(new Date(base.getTime() - 15 * 60 * 1000).toISOString(), base), '15m ago');
      assert.equal(formatRelativeTime(new Date(base.getTime() - 2 * 3600 * 1000).toISOString(), base), '2h ago');
      assert.equal(formatRelativeTime(new Date(base.getTime() - 3 * 86400 * 1000).toISOString(), base), '3d ago');
    });

    test('handles missing or invalid timestamp gracefully', () => {
      assert.equal(formatRelativeTime(null), 'unknown');
      assert.equal(formatRelativeTime(undefined), 'unknown');
    });
  });

  describe('Semantic Status Badges', () => {
    test('renders distinct badges without color enabled', () => {
      const styler = createStyler(false);
      assert.equal(formatStatusBadge('VERIFIED', styler), 'VERIFIED');
      assert.equal(formatStatusBadge('REGRESSED', styler), 'REGRESSED');
      assert.equal(formatStatusBadge('FIXED', styler), 'FIXED');
      assert.equal(formatStatusBadge('SUSPECTED', styler), 'SUSPECTED');
      assert.equal(formatStatusBadge('OBSERVED', styler), 'OBSERVED');
    });

    test('renders colored badges when color enabled', () => {
      const styler = createStyler(true);
      assert.ok(formatStatusBadge('VERIFIED', styler).includes('\x1b[32m'));
      assert.ok(formatStatusBadge('REGRESSED', styler).includes('\x1b[31m'));
      assert.ok(formatStatusBadge('FIXED', styler).includes('\x1b[36m'));
      assert.ok(formatStatusBadge('SUSPECTED', styler).includes('\x1b[33m'));
    });
  });

  describe('Restrained Box Card Formatter', () => {
    test('formats clean boxed card', () => {
      const styler = createStyler(false);
      const box = formatBox('✓ RECOVERY VERIFIED', [
        { label: 'Incident', value: '#12' },
        { label: 'Command', value: 'npm test' },
        { label: 'Exit Code', value: '0' }
      ], styler, 'success');

      assert.ok(box.startsWith('┌─'));
      assert.ok(box.includes('✓ RECOVERY VERIFIED'));
      assert.ok(box.includes('Incident:              #12'));
      assert.ok(box.endsWith('─┘'));
    });
  });

  describe('CLI Display Verification under NO_COLOR', () => {
    test('history output contains no ANSI escapes under NO_COLOR', async () => {
      const mock = createMockIO({ env: { NO_COLOR: '1' } });
      await runCLI(['history'], mock.io);
      const out = mock.getStdout();
      assert.ok(!out.includes('\x1b['));
    });

    test('help output contains no ANSI escapes under NO_COLOR', async () => {
      const mock = createMockIO({ env: { NO_COLOR: '1' } });
      await runCLI(['--help'], mock.io);
      const out = mock.getStdout();
      assert.ok(!out.includes('\x1b['));
      assert.ok(out.includes('REWIND — Remember what fixed it.'));
      assert.ok(out.includes('CORE WORKFLOW:'));
      assert.ok(out.includes('SAFETY & TRUST INVARIANTS:'));
    });
  });
});
