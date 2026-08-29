import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldEnableColor, createStyler, formatJson, formatError } from '../src/formatter.js';

describe('Output Formatter & NO_COLOR (src/formatter.js)', () => {
  test('shouldEnableColor disables color when noColorFlag is true', () => {
    assert.equal(shouldEnableColor({ isTTY: true, env: { FORCE_COLOR: '1' }, noColorFlag: true }), false);
  });

  test('shouldEnableColor respects NO_COLOR environment variable (https://no-color.org)', () => {
    assert.equal(shouldEnableColor({ isTTY: true, env: { NO_COLOR: '1' } }), false);
    assert.equal(shouldEnableColor({ isTTY: true, env: { NO_COLOR: 'true' } }), false);
    assert.equal(shouldEnableColor({ isTTY: true, env: { NO_COLOR: '0' } }), false);
    // If NO_COLOR is empty string, standard says it does NOT disable
    assert.equal(shouldEnableColor({ isTTY: true, env: { NO_COLOR: '' } }), true);
  });

  test('shouldEnableColor respects FORCE_COLOR environment variable', () => {
    assert.equal(shouldEnableColor({ isTTY: false, env: { FORCE_COLOR: '1' } }), true);
    assert.equal(shouldEnableColor({ isTTY: false, env: { FORCE_COLOR: 'true' } }), true);
  });

  test('shouldEnableColor respects isTTY when no overriding env vars exist', () => {
    assert.equal(shouldEnableColor({ isTTY: true, env: {} }), true);
    assert.equal(shouldEnableColor({ isTTY: false, env: {} }), false);
  });

  test('createStyler formats text with ANSI escape codes when enabled', () => {
    const styler = createStyler(true);
    const text = 'Hello';
    assert.equal(styler.bold(text), '\x1b[1mHello\x1b[0m');
    assert.equal(styler.red(text), '\x1b[31mHello\x1b[0m');
    assert.equal(styler.green(text), '\x1b[32mHello\x1b[0m');
  });

  test('createStyler returns raw unstyled text when disabled', () => {
    const styler = createStyler(false);
    const text = 'Hello';
    assert.equal(styler.bold(text), 'Hello');
    assert.equal(styler.red(text), 'Hello');
    assert.equal(styler.green(text), 'Hello');
  });

  test('formatJson outputs properly formatted JSON with 2-space indentation', () => {
    const data = { name: 'rewind', ok: true, count: 5 };
    const json = formatJson(data);
    assert.equal(json, JSON.stringify(data, null, 2));
    assert.deepEqual(JSON.parse(json), data);
  });

  test('formatError formats error message with prefix', () => {
    const styler = createStyler(false);
    const err = new Error('Test failure');
    const formatted = formatError(err, styler);
    assert.equal(formatted, 'error: Test failure');
  });
});
