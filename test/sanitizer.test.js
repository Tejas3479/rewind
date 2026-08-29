import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi, sanitizeOutput } from '../src/sanitizer.js';

describe('Output Sanitizer & Anti-Escape (src/sanitizer.js)', () => {
  test('stripAnsi removes color and style escape codes', () => {
    const colored = '\x1b[31mRed\x1b[0m \x1b[1mBold\x1b[0m \x1b[32;4mGreen Underlined\x1b[0m';
    assert.equal(stripAnsi(colored), 'Red Bold Green Underlined');
  });

  test('stripAnsi removes cursor movement and screen clear sequences', () => {
    const sequences = '\x1b[2J\x1b[HHello\x1b[1A\x1b[2KWorld';
    assert.equal(stripAnsi(sequences), 'HelloWorld');
  });

  test('sanitizeOutput normalizes line breaks and strips control characters', () => {
    const raw = 'Line 1\r\n\x1b[31mLine 2\x1b[0m\rLine 3\x00\x07\x1b';
    const clean = sanitizeOutput(raw);
    assert.equal(clean, 'Line 1\nLine 2\nLine 3');
  });

  test('handles null, undefined, and non-string values gracefully', () => {
    assert.equal(stripAnsi(null), '');
    assert.equal(stripAnsi(undefined), '');
    assert.equal(sanitizeOutput(null), '');
  });
});
