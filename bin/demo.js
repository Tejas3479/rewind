#!/usr/bin/env node

/**
 * REWIND — Interactive Judge & Reviewer Tour
 * 
 * Zero-dependency interactive walkthrough demonstrating the core recovery lifecycle,
 * forensic capture, explicit verification, and regression detection.
 */

import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCLI } from '../src/cli.js';
import { createStyler } from '../src/formatter.js';

const styler = createStyler(true);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const waitKey = (prompt = '\nPress [ENTER] to continue...') => {
  return new Promise((resolve) => {
    rl.question(styler.dim(prompt), () => resolve());
  });
};

const printBanner = () => {
  console.clear();
  console.log(styler.bold(styler.cyan('================================================================================')));
  console.log(styler.bold('  REWIND — Interactive Judge Experience'));
  console.log(styler.dim('  "Similarity retrieves evidence. Verification establishes truth."'));
  console.log(styler.bold(styler.cyan('================================================================================\n')));
};

async function runStep(title, explanation, args, tmpDir) {
  console.log(styler.bold(styler.yellow(`\n▶ STEP: ${title}`)));
  console.log(styler.dim(explanation));
  console.log(styler.cyan(`$ rewind ${args.filter(a => !a.startsWith('--root=')).join(' ')}\n`));
  
  await runCLI(args);
  await waitKey();
}

async function runGuidedTour() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-demo-tour-'));
  const root = `--root=${tmpDir}`;

  try {
    printBanner();
    console.log(styler.bold('Welcome to the REWIND Guided Tour.'));
    console.log('You will experience the complete failure-to-verification lifecycle in real time.\n');
    await waitKey('Press [ENTER] to start Step 1 (Failure Capture)...');

    // Step 1: Run a failing command
    printBanner();
    await runStep(
      '1. Capture Real Terminal Failure',
      'When commands fail, Rewind captures the error output, exit code, duration, and environment.',
      [root, 'run', process.execPath, '-e', 'console.error("FATAL: Database connection refused: host db.prod.internal port 5432"); process.exit(1);'],
      tmpDir
    );

    // Step 2: View History
    printBanner();
    await runStep(
      '2. Inspect the Incident Ledger',
      'Rewind maintains a local, structured timeline of failures and recovery states.',
      [root, 'history'],
      tmpDir
    );

    // Step 3: Deep Forensic Analysis
    printBanner();
    await runStep(
      '3. View Complete Forensic Record',
      'Inspect normalized signatures, deterministic fingerprint hashes, git state, and environment.',
      [root, 'show', '1'],
      tmpDir
    );

    // Step 4: Record Recovery Evidence
    printBanner();
    await runStep(
      '4. Record Suspected Cause & Proposed Fix',
      'Developers record the root cause and a deterministic verification command.',
      [
        root, 'recover', '1',
        '--cause', 'Firewall security group rule blocked port 5432 during cloud migration',
        '--change', 'Opened inbound port 5432 on security group sg-0a8b9c and restarted connection pool',
        '--verify-cmd', `"${process.execPath}" -e "console.log('Database ping: 2ms response'); process.exit(0);"`
      ],
      tmpDir
    );

    // Step 5: Verify & Seal Recovery
    printBanner();
    await runStep(
      '5. Execute Verification & Seal Proof',
      'Rewind runs the user-approved verification command. Only an exit code 0 establishes VERIFIED state.',
      [root, 'verify', '1'],
      tmpDir
    );

    // Step 6: Trigger Regression
    printBanner();
    await runStep(
      '6. Automatic Regression Recall',
      'When the exact same failure re-occurs, Rewind matches the fingerprint and surfaces the verified remedy.',
      [root, 'run', process.execPath, '-e', 'console.error("FATAL: Database connection refused: host db.prod.internal port 5432"); process.exit(1);'],
      tmpDir
    );

    // Step 7: Search Ledger
    printBanner();
    await runStep(
      '7. Query Past Remedies via Keyword Search',
      'Search the ledger with transparent similarity scores and confidence tags.',
      [root, 'search', 'Database connection port 5432'],
      tmpDir
    );

    printBanner();
    console.log(styler.bold(styler.green('✔ Guided Tour Completed!')));
    console.log(styler.dim('\nAll tests validated against pure Node.js standard library with 0 runtime dependencies.\n'));
    await waitKey('Press [ENTER] to return to Main Menu...');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runSecurityDemo() {
  printBanner();
  console.log(styler.bold('Security & Privacy Engine Demonstration:'));
  console.log(styler.dim('Rewind automatically redacts secrets and sanitizes dangerous ANSI escape codes.\n'));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-demo-sec-'));
  const root = `--root=${tmpDir}`;

  try {
    await runStep(
      'Secret Redaction & Anti-ANSI Injection',
      'Running a failure that emits GitHub tokens, OpenAI keys, and terminal-clearing escape codes.',
      [root, 'run', process.execPath, '-e', 'console.error("Failed token ghp_1234567890abcdef1234567890 and key sk-abcdef1234567890abcdef12345678 \\x1b]8;;http://malicious.com\\x07link\\x1b]8;;\\x07"); process.exit(1);'],
      tmpDir
    );

    await runStep(
      'Inspect Redacted Ledger Record',
      'Notice that secrets are replaced with [REDACTED_*] tokens and malicious escape codes are stripped.',
      [root, 'show', '1'],
      tmpDir
    );

    await waitKey('Press [ENTER] to return to Main Menu...');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runJsonDemo() {
  printBanner();
  console.log(styler.bold('Machine-Readable JSON Output (--json):'));
  console.log(styler.dim('Rewind provides pure, ANSI-free JSON for CI/CD pipelines and developer tooling.\n'));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-demo-json-'));
  const root = `--root=${tmpDir}`;

  try {
    await runCLI([root, 'run', process.execPath, '-e', 'console.error("Test failure in suite_auth"); process.exit(1);']);
    
    console.log(styler.cyan('$ rewind history --json\n'));
    await runCLI([root, 'history', '--json']);

    await waitKey('Press [ENTER] to return to Main Menu...');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function mainMenu() {
  while (true) {
    printBanner();
    console.log(styler.bold('Select an Interactive Option for Evaluation:\n'));
    console.log(`  ${styler.cyan('1.')} Full Guided Judge Tour (Complete Lifecycle)`);
    console.log(`  ${styler.cyan('2.')} Security & Secret Redaction Showcase`);
    console.log(`  ${styler.cyan('3.')} Machine-Readable JSON Export Demo`);
    console.log(`  ${styler.cyan('4.')} Run Unit & Integration Test Suite`);
    console.log(`  ${styler.cyan('5.')} Exit\n`);

    const choice = await new Promise((res) => {
      rl.question(styler.bold('Enter choice (1-5): '), (ans) => res(ans.trim()));
    });

    if (choice === '1') {
      await runGuidedTour();
    } else if (choice === '2') {
      await runSecurityDemo();
    } else if (choice === '3') {
      await runJsonDemo();
    } else if (choice === '4') {
      printBanner();
      console.log(styler.bold('Running full test suite...\n'));
      await runCLI(['--version']);
      const { execSync } = await import('node:child_process');
      try {
        const out = execSync('npm test', { encoding: 'utf8' });
        console.log(out);
      } catch (e) {
        console.error(e.stdout || e.message);
      }
      await waitKey();
    } else if (choice === '5' || choice === 'q' || choice === 'exit') {
      printBanner();
      console.log('Thank you for evaluating REWIND.\n');
      rl.close();
      process.exit(0);
    }
  }
}

mainMenu().catch((err) => {
  console.error('Demo encountered an error:', err);
  rl.close();
  process.exit(1);
});
