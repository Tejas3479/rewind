import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffWords, createUnifiedDiff, formatColorDiff } from '../src/diff.js';
import { createStyler } from '../src/formatter.js';

describe('Zero-Dependency Diff Engine (src/diff.js)', () => {
  describe('diffLines', () => {
    it('returns empty array when both inputs are empty', () => {
      assert.deepEqual(diffLines('', ''), []);
    });

    it('returns unchanged lines for identical text', () => {
      const text = 'line 1\nline 2\nline 3';
      const result = diffLines(text, text);
      assert.equal(result.length, 3);
      assert.ok(result.every((r) => r.type === 'unchanged'));
      assert.equal(result[0].value, 'line 1');
    });

    it('accurately identifies line additions', () => {
      const oldText = 'line 1\nline 3';
      const newText = 'line 1\nline 2\nline 3';
      const result = diffLines(oldText, newText);

      assert.equal(result.length, 3);
      assert.equal(result[0].type, 'unchanged');
      assert.equal(result[1].type, 'added');
      assert.equal(result[1].value, 'line 2');
      assert.equal(result[2].type, 'unchanged');
    });

    it('accurately identifies line removals', () => {
      const oldText = 'line 1\nline 2\nline 3';
      const newText = 'line 1\nline 3';
      const result = diffLines(oldText, newText);

      assert.equal(result.length, 3);
      assert.equal(result[0].type, 'unchanged');
      assert.equal(result[1].type, 'removed');
      assert.equal(result[1].value, 'line 2');
      assert.equal(result[2].type, 'unchanged');
    });

    it('handles complete replacement', () => {
      const oldText = 'old content';
      const newText = 'new content';
      const result = diffLines(oldText, newText);

      assert.equal(result.length, 2);
      assert.equal(result[0].type, 'removed');
      assert.equal(result[0].value, 'old content');
      assert.equal(result[1].type, 'added');
      assert.equal(result[1].value, 'new content');
    });
  });

  describe('diffWords', () => {
    it('accurately identifies inline word substitutions', () => {
      const oldText = 'const timeout = 1000;';
      const newText = 'const timeout = 5000;';
      const result = diffWords(oldText, newText);

      const added = result.find((r) => r.type === 'added');
      const removed = result.find((r) => r.type === 'removed');

      assert.ok(added, 'Should contain added token');
      assert.ok(removed, 'Should contain removed token');
      assert.equal(added.value, '5000');
      assert.equal(removed.value, '1000');
    });
  });

  describe('createUnifiedDiff', () => {
    it('returns empty string if content is unchanged', () => {
      assert.equal(createUnifiedDiff('a.txt', 'b.txt', 'identical', 'identical'), '');
    });

    it('produces git-compatible unified diff format with hunks', () => {
      const oldText = 'alpha\nbeta\ngamma\ndelta';
      const newText = 'alpha\nbeta_modified\ngamma\ndelta';
      const diff = createUnifiedDiff('a/file.js', 'b/file.js', oldText, newText);

      assert.ok(diff.includes('--- a/file.js'), 'Must contain old file header');
      assert.ok(diff.includes('+++ b/file.js'), 'Must contain new file header');
      assert.ok(diff.includes('@@ -1,4 +1,4 @@'), 'Must contain valid hunk header');
      assert.ok(diff.includes('-beta'), 'Must contain removed line');
      assert.ok(diff.includes('+beta_modified'), 'Must contain added line');
    });
  });

  describe('formatColorDiff', () => {
    it('preserves plain text when styler is disabled or NO_COLOR is set', () => {
      const styler = createStyler(false);
      const diff = '--- a\n+++ b\n-old\n+new';
      const formatted = formatColorDiff(diff, styler);
      assert.equal(formatted, diff);
    });

    it('applies ANSI color sequences when styler is enabled', () => {
      const styler = createStyler(true);
      const diff = '--- a\n+++ b\n@@ -1,1 +1,1 @@\n-old\n+new';
      const formatted = formatColorDiff(diff, styler);

      assert.ok(formatted.includes('\x1b['), 'Should contain ANSI escape codes');
      assert.ok(formatted.includes('old'), 'Should retain original content');
      assert.ok(formatted.includes('new'), 'Should retain original content');
    });
  });
});