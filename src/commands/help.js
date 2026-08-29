/**
 * Help command documentation and formatting.
 */

const COMMAND_DOCS = {
  run: {
    usage: 'rewind run <command...>',
    description: 'Execute a command, capture failure evidence on non-zero exit, and track recovery context.',
    arguments: [
      { name: '<command...>', description: 'Command and arguments to execute' }
    ],
    options: [
      { flag: '--no-color', description: 'Disable ANSI color formatting' },
      { flag: '--root <path>', description: 'Explicit project root / ledger directory' }
    ],
    examples: [
      'rewind run npm test',
      'rewind run cargo build --release',
      'rewind run pytest tests/test_core.py'
    ]
  },
  history: {
    usage: 'rewind history [options]',
    description: 'List failure records and recovery timeline from the local ledger.',
    arguments: [],
    options: [
      { flag: '--limit <N>, -n <N>', description: 'Limit number of entries displayed' },
      { flag: '--json', description: 'Output history in JSON format' },
      { flag: '--no-color', description: 'Disable ANSI color formatting' },
      { flag: '--root <path>', description: 'Explicit project root / ledger directory' }
    ],
    examples: [
      'rewind history',
      'rewind history --limit 5',
      'rewind history --json'
    ]
  },
  show: {
    usage: 'rewind show <id> [options]',
    description: 'Inspect full failure details, preserved environment, recovery attempts, and verification status for a specific incident ID.',
    arguments: [
      { name: '<id>', description: 'Incident ID to inspect' }
    ],
    options: [
      { flag: '--json', description: 'Output incident details in JSON format' },
      { flag: '--no-color', description: 'Disable ANSI color formatting' },
      { flag: '--root <path>', description: 'Explicit project root / ledger directory' }
    ],
    examples: [
      'rewind show 1',
      'rewind show 1 --json'
    ]
  },
  recover: {
    usage: 'rewind recover <id> [options]',
    description: 'Guide recovery for a failed incident and record attempted remediation steps.',
    arguments: [
      { name: '<id>', description: 'Incident ID to recover' }
    ],
    options: [
      { flag: '--cause <text>', description: 'Suspected root cause' },
      { flag: '--change <text>', description: 'Remediation action taken' },
      { flag: '--verify-cmd <cmd>', description: 'Explicit verification command' },
      { flag: '--no-color', description: 'Disable ANSI color formatting' },
      { flag: '--root <path>', description: 'Explicit project root / ledger directory' }
    ],
    examples: [
      'rewind recover 1 --cause "Bad config" --change "Updated port" --verify-cmd "npm test"'
    ]
  },
  verify: {
    usage: 'rewind verify <id>',
    description: 'Execute the verification command for an incident to validate the fix and seal the verified-recovery record.',
    arguments: [
      { name: '<id>', description: 'Incident ID to verify' }
    ],
    options: [
      { flag: '--no-color', description: 'Disable ANSI color formatting' },
      { flag: '--root <path>', description: 'Explicit project root / ledger directory' }
    ],
    examples: [
      'rewind verify 1'
    ]
  },
  search: {
    usage: 'rewind search <query...> [options]',
    description: 'Search historical failures by error message, keywords, or fingerprint using conservative similarity scoring.',
    arguments: [
      { name: '<query...>', description: 'Search terms or error message snippet' }
    ],
    options: [
      { flag: '--limit <N>, -n <N>', description: 'Limit number of candidate matches' },
      { flag: '--json', description: 'Output search results as JSON' },
      { flag: '--no-color', description: 'Disable ANSI color formatting' },
      { flag: '--root <path>', description: 'Explicit project root / ledger directory' }
    ],
    examples: [
      'rewind search "database connection pool"',
      'rewind search "ECONNREFUSED"',
      'rewind search 83282360259b'
    ]
  }
};

/**
 * Formats top-level CLI help text.
 *
 * @param {import('../formatter.js').createStyler} s - Styler instance
 * @returns {string}
 */
export function formatTopLevelHelp(s) {
  const lines = [
    `${s.bold('REWIND')} — Remember what fixed it.`,
    `${s.dim('A local verified-recovery ledger for the terminal.')}`,
    '',
    `${s.bold('USAGE:')}`,
    `  ${s.cyan('rewind')} ${s.yellow('<command>')} [options]`,
    '',
    `${s.bold('CORE WORKFLOW:')}`,
    `  1. ${s.cyan('rewind run <command...>')}      Run command, stream output, and record failures on error`,
    `  2. ${s.cyan('rewind history')}               Browse timeline of past failures and recovery states`,
    `  3. ${s.cyan('rewind show <id>')}             Inspect full forensic logs, environment, and error fingerprint`,
    `  4. ${s.cyan('rewind recover <id>')}          Record suspected cause, fix, and explicit verification command`,
    `  5. ${s.cyan('rewind verify <id>')}           Run the user-approved verification command to validate and seal fix`,
    `  6. ${s.cyan('rewind search <query...>')}     Search past failures by keyword, error text, or fingerprint`,
    '',
    `${s.bold('GLOBAL OPTIONS:')}`,
    `  ${s.yellow('-h, --help')}                    Show help information`,
    `  ${s.yellow('-v, --version')}                 Show version number`,
    `  ${s.yellow('--json')}                        Output results as machine-readable JSON (read-only commands)`,
    `  ${s.yellow('--no-color')}                    Disable ANSI color formatting (also respects NO_COLOR)`,
    `  ${s.yellow('--root <path>')}                 Specify project root / ledger location`,
    `  ${s.yellow('-n, --limit <N>')}               Limit number of results in history and search`,
    '',
    `${s.bold('SAFETY & TRUST INVARIANTS:')}`,
    `  • ${s.dim('Zero Auto-Execution:')} Rewind NEVER automatically executes historical recovery fixes.`,
    `  • ${s.dim('Explicit Verification:')} Verification runs ONLY the command explicitly approved by the user.`,
    `  • ${s.dim('Local & Offline:')} 100% offline, zero network requests, zero telemetry, zero dependencies.`,
    '',
    `${s.bold('LEARN MORE:')}`,
    `  Run ${s.cyan('rewind <command> --help')} or ${s.cyan('rewind help <command>')} for command details.`
  ];

  return lines.join('\n');
}

/**
 * Formats help text for a specific command.
 *
 * @param {string} commandName
 * @param {import('../formatter.js').createStyler} s
 * @returns {string}
 */
export function formatCommandHelp(commandName, s) {
  const doc = COMMAND_DOCS[commandName];
  if (!doc) {
    return formatTopLevelHelp(s);
  }

  const lines = [
    `${s.bold(`REWIND ${commandName.toUpperCase()}`)} — ${doc.description}`,
    '',
    `${s.bold('USAGE:')}`,
    `  ${s.cyan(doc.usage)}`,
    ''
  ];

  if (doc.arguments.length > 0) {
    lines.push(`${s.bold('ARGUMENTS:')}`);
    for (const arg of doc.arguments) {
      lines.push(`  ${s.yellow(arg.name.padEnd(20))} ${arg.description}`);
    }
    lines.push('');
  }

  if (doc.options.length > 0) {
    lines.push(`${s.bold('OPTIONS:')}`);
    for (const opt of doc.options) {
      lines.push(`  ${s.yellow(opt.flag.padEnd(20))} ${opt.description}`);
    }
    lines.push('');
  }

  if (doc.examples.length > 0) {
    lines.push(`${s.bold('EXAMPLES:')}`);
    for (const ex of doc.examples) {
      lines.push(`  ${s.dim('$')} ${ex}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Handler for the help route.
 */
export async function helpCommand({ commandName = null, context }) {
  const { stdout, styler } = context;
  if (commandName && COMMAND_DOCS[commandName]) {
    stdout.write(formatCommandHelp(commandName, styler) + '\n');
  } else {
    stdout.write(formatTopLevelHelp(styler) + '\n');
  }
  return 0;
}
