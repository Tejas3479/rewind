# REWIND — “Remember what fixed it.”

> **A verified-recovery ledger for the terminal.**

Rewind is a zero-dependency developer CLI tool that captures terminal failures, preserves failure context, records attempted remediations, verifies recoveries through explicit user-approved verification commands, and remembers verified solutions for future failures.

---

## Thesis

Terminal errors happen constantly during development, testing, and deployment. Developers often lose hours searching for a fix they already solved weeks ago.

**Rewind** transforms every terminal failure into a structured, verifiable recovery ledger:
1. **Captures Failures:** Runs developer commands and snapshots exit codes, stdout, stderr, and execution environment on failure.
2. **Preserves Evidence:** Stores immutable failure logs and diagnostic traces locally in `.rewind/`.
3. **Tracks Recovery Attempts:** Documents step-by-step remediation commands.
4. **Verifies Fixes:** Executes explicit verification commands to prove the fix actually works.
5. **Seals Ledger Records:** Remembers verified solutions so past fixes can be instantly retrieved when the same failure recurs.

---

## Core Commands

| Command | Description |
| :--- | :--- |
| `rewind run <command...>` | Execute command and record failure evidence |
| `rewind history [--json]` | View failure and recovery ledger timeline |
| `rewind show <id> [--json]` | Inspect failure details, logs, and recovery state |
| `rewind recover <id>` | Attempt remediation and capture recovery action |
| `rewind verify <id>` | Run verification command and seal verified fix |

### Global Options
- `-h, --help`: Show help text
- `-v, --version`: Show version number
- `--json`: Output structured JSON (supported by read-only commands)
- `--no-color`: Disable ANSI color output (also respects [`NO_COLOR`](https://no-color.org))
- `--root <path>`: Specify project root / ledger location

---

## Zero-Dependency Architecture

- Built exclusively with **Node.js standard library built-ins** (`node:process`, `node:fs`, `node:path`, `node:os`, `node:util`).
- **0** runtime dependencies.
- **0** dev dependencies.
- Native test runner using `node:test` and `node:assert`.

---

## Development & Testing

```bash
# Run automated test suite
npm test

# Run syntax checks
npm run check

# Direct CLI usage
node bin/rewind.js --help
```

---

## License

MIT
