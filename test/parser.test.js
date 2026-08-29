import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/parser.js';
import { InvalidArgumentError } from '../src/errors.js';

describe('Argument Parser (src/parser.js)', () => {
  test('parses empty args as null command and default flags', () => {
    const result = parseArgs([]);
    assert.equal(result.command, null);
    assert.deepEqual(result.positional, []);
    assert.equal(result.flags.help, false);
    assert.equal(result.flags.version, false);
    assert.equal(result.flags.json, false);
    assert.equal(result.flags.noColor, false);
    assert.equal(result.flags.root, null);
  });

  test('parses --help and -h flags', () => {
    assert.equal(parseArgs(['--help']).flags.help, true);
    assert.equal(parseArgs(['-h']).flags.help, true);
  });

  test('parses --version and -v flags', () => {
    assert.equal(parseArgs(['--version']).flags.version, true);
    assert.equal(parseArgs(['-v']).flags.version, true);
  });

  test('parses --json flag', () => {
    const result = parseArgs(['history', '--json']);
    assert.equal(result.command, 'history');
    assert.equal(result.flags.json, true);
  });

  test('parses --no-color flag', () => {
    const result = parseArgs(['--no-color', 'history']);
    assert.equal(result.command, 'history');
    assert.equal(result.flags.noColor, true);
  });

  test('parses --root flag with space and with equals', () => {
    const res1 = parseArgs(['--root', '/custom/path', 'history']);
    assert.equal(res1.flags.root, '/custom/path');
    assert.equal(res1.command, 'history');

    const res2 = parseArgs(['--root=/custom/path', 'show', '1']);
    assert.equal(res2.flags.root, '/custom/path');
    assert.equal(res2.command, 'show');
    assert.deepEqual(res2.positional, ['1']);
  });

  test('throws InvalidArgumentError when --root is missing a path value', () => {
    assert.throws(() => parseArgs(['--root']), InvalidArgumentError);
    assert.throws(() => parseArgs(['--root', '--json']), InvalidArgumentError);
    assert.throws(() => parseArgs(['--root=']), InvalidArgumentError);
  });

  test('preserves all trailing arguments for "run" command', () => {
    const result = parseArgs(['run', 'npm', 'test', '--coverage', '--json']);
    assert.equal(result.command, 'run');
    assert.deepEqual(result.positional, ['npm', 'test', '--coverage', '--json']);
  });

  test('normalizes "rewind help [cmd]" to help command and target subcommand', () => {
    const res1 = parseArgs(['help']);
    assert.equal(res1.command, null);
    assert.equal(res1.flags.help, true);

    const res2 = parseArgs(['help', 'show']);
    assert.equal(res2.command, 'show');
    assert.equal(res2.flags.help, true);
  });

  test('throws InvalidArgumentError for unrecognized flags on root/commands', () => {
    assert.throws(() => parseArgs(['--unknown-flag']), InvalidArgumentError);
    assert.throws(() => parseArgs(['history', '--invalid']), InvalidArgumentError);
  });

  test('parses and validates --limit and -n flags properly', () => {
    const res1 = parseArgs(['history', '--limit', '5']);
    assert.equal(res1.flags.limit, 5);

    const res2 = parseArgs(['history', '-n', '10']);
    assert.equal(res2.flags.limit, 10);

    const res3 = parseArgs(['history', '--limit=20']);
    assert.equal(res3.flags.limit, 20);

    assert.throws(() => parseArgs(['history', '--limit']), InvalidArgumentError);
    assert.throws(() => parseArgs(['history', '--limit', '-1']), InvalidArgumentError);
    assert.throws(() => parseArgs(['history', '--limit', '0']), InvalidArgumentError);
    assert.throws(() => parseArgs(['history', '--limit', 'abc']), InvalidArgumentError);
  });
});
