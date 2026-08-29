# REWIND — “Remember what fixed it.”

> **A verified-recovery ledger for the terminal.**

Rewind is a zero-dependency developer CLI tool that captures command failures, preserves diagnostic evidence, tracks remediation steps, verifies recoveries through explicit user-approved verification commands, and recalls verified solutions when identical failures recur.

---

## 1. What is Rewind and Why Does It Exist?

Terminal errors happen constantly during development, testing, and CI/CD. Developers frequently lose hours rediscovering fixes for obscure errors (e.g. database connection pool exhaustion, missing native bindings, configuration syntax errors) that they or their team already solved in the past.

Command history logs *what* was typed, but not *why* it failed, *what* was changed to fix it, or *whether* the fix was verified.

**Rewind** bridges this gap:
1. **Captures Failures:** Wraps command execution, streaming live stdout/stderr while recording exit codes, timing, environment metadata, and git HEAD status upon failure.
2. **Preserves Evidence:** Stores crash-safe, immutable JSON records in a local `.rewind/` ledger.
3. **Fingerprints Error Memory:** Conservatively normalizes transient noise (timestamps, PIDs, temporary paths, memory pointers) and computes reproducible 16-character SHA-256 fingerprints.
4. **Enforces the Trust Loop:** Tracks remediation across a strict state machine (`OBSERVED` $\rightarrow$ `SUSPECTED` $\rightarrow$ `FIXED` $\rightarrow$ `VERIFIED` and `VERIFIED` $\rightarrow$ `REGRESSED`).
5. **Detects Regressions:** Instantly recognizes recurring failures, flags them as `REGRESSED`, and surfaces the previous verified fix and verification command.
6. **Near-Match Search:** Deterministically searches historical failures using keyword recall, Jaccard overlap, and clear evidence confidence labels (`VERIFIED`, `LIKELY`, `NOT PROVEN`).

---

## 2. The Verification & Trust Model

Rewind operates on strict safety and evidentiary principles:

```
[Command Fails]
       ↓
   OBSERVED
       ↓ (record suspected cause)
   SUSPECTED
       ↓ (record change made & verification command)
     FIXED
       ↓ (rewind verify <id> passes with exit code 0)
   VERIFIED
       ↓ (identical failure fingerprint recurs in the future)
   REGRESSED
       ↓ (new recovery loop initiated)
   SUSPECTED → FIXED → VERIFIED
```

### Critical Safety Invariants
* **Zero Automatic Execution of Historical Fixes:** Historical remediation is *evidence*, not authority. Rewind never executes past fixes automatically.
* **Explicit User Verification:** `rewind verify <id>` executes **only** the verification command explicitly recorded by the user for that specific incident.
* **Verified vs. Likely:** A fix is only labeled `VERIFIED` after its explicit verification command exits with code `0`. Search results and unverified records (`OBSERVED`, `SUSPECTED`, `FIXED`) are never presented with `VERIFIED` confidence.

---

## 3. Core Commands

| Command | Description |
| :--- | :--- |
| `rewind run <command...>` | Execute a command, stream output live, and record failure evidence on non-zero exit |
| `rewind history [options]` | View failure records and recovery ledger timeline (sorted newest first) |
| `rewind show <id> [options]` | Inspect complete forensic failure snapshot, logs, environment, and recovery status |
| `rewind recover <id> [options]` | Record suspected cause, remediation change, and explicit verification command |
| `rewind verify <id>` | Execute the user-approved verification command to validate and seal the fix |
| `rewind search <query...> [options]` | Deterministically search historical failures by error message, keywords, or fingerprint |

### Global Options
- `-h, --help`: Show top-level or command-specific help
- `-v, --version`: Show version (`rewind v0.1.0`)
- `--json`: Output machine-readable JSON on stdout
- `--no-color`: Disable ANSI styling (also respects standard [`NO_COLOR`](https://no-color.org))
- `--root <path>`: Specify custom project root or `.rewind` directory location
- `--limit <N>` / `-n <N>`: Limit number of results in `history` and `search`

---

## 4. Installation & Execution

### Prerequisites
* Node.js **>= 20.0.0** (tested and verified on Node.js v20.x, v22.x, v24.x LTS).
* **Zero npm packages required.** No `npm install` step needed.

### Running Rewind
```bash
# Clone the repository
git clone https://github.com/Tejas3479/rewind.git
cd rewind

# Run directly using Node
node bin/rewind.js --help

# Optional: Link locally for global `rewind` executable
npm link
rewind --version
```

### Running Tests
```bash
# Run complete test suite (117 unit, integration, and security tests)
npm test

# Run syntax verification across all codebase files
npm run check
```

---

## 5. End-to-End Example Workflow

```bash
# 1. Run a command that fails
$ rewind run node -e "console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);"
FATAL: Database connection pool exhausted on port 5432
[rewind] Recorded failure as incident #1. Run "rewind show 1" to inspect.

# 2. Record recovery details and verification command
$ rewind recover 1 \
    --cause "Connection pool size was set to 1 instead of 20" \
    --change "Increased pool size to 20 in database.config" \
    --verify-cmd 'node -e "process.exit(0);"'
[rewind] Incident #1 transitioned to state: FIXED
  Suspected Cause: Connection pool size was set to 1 instead of 20
  Change Made:     Increased pool size to 20 in database.config
  Verify Command:  node -e process.exit(0);
Ready to verify! Run "rewind verify 1" to validate and seal this fix.

# 3. Explicitly verify the recovery
$ rewind verify 1
[rewind:verify] Executing user-approved verification command for Incident #1:
  $ node -e process.exit(0);

[rewind] VERIFIED! Incident #1 successfully validated under recorded conditions.
The verified recovery has been sealed into the ledger.

# 4. Same failure recurs weeks later -> Rewind detects regression immediately!
$ rewind run node -e "console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);"
FATAL: Database connection pool exhausted on port 5432

[rewind:REGRESSION] Failure matches previously VERIFIED Incident #1!
  Suspected Cause: Connection pool size was set to 1 instead of 20
  Verified Fix:    Increased pool size to 20 in database.config
  Verify Command:  node -e process.exit(0);
Recorded new occurrence as Incident #2 (Status: REGRESSED). Run "rewind show 2".

# 5. Search failure memory by error terms
$ rewind search "connection pool exhausted"
[VERIFIED RECOVERY] Incident #1 [fp: 83282360] — Similarity: 86%
  Status:       VERIFIED
  Command:      node -e console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);
  Match Reason: Exact query phrase match in failure output (3 matching terms: connection, pool, exhausted)
  Suspected Cause: Connection pool size was set to 1 instead of 20
  Historical Fix:  Increased pool size to 20 in database.config
  Verify Cmd:      node -e process.exit(0);
  ✔ Verified under recorded conditions
```

---

## 6. Zero-Dependency Guarantee

Rewind is strictly compliant with the **Zero Third-Party Dependency** standard:
- **`package.json` dependencies:** `0` runtime dependencies, `0` dev dependencies.
- **Node.js standard library built-ins only:** `node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:os`, `node:test`, `node:assert/strict`.
- **No external subprocess dependencies:** Reads Git metadata directly from `.git/` filesystem structures rather than invoking `git`.
- **No network/cloud services:** 100% offline local operation. No HTTP clients, no telemetry, no cloud accounts, no external AI APIs, no SQLite or remote databases.

See [`STDLIB.md`](./STDLIB.md) for full mapping of standard library implementations.
See [`DEPENDENCY_PROOF.md`](./DEPENDENCY_PROOF.md) for automated audit verification instructions.

---

## 7. Security & Privacy Hardening

Rewind is built with privacy-by-default and terminal security:
- **Secret Redaction:** Regex patterns redact OpenAI (`sk-...`), GitHub (`ghp_...`), AWS (`AKIA...`), Slack (`xoxb-...`), Bearer tokens, Basic Auth URLs, and PEM private keys from output displays and normalized indices.
- **Terminal Control Safety:** Untrusted stdout/stderr is stripped of ANSI escape sequences, OSC hyperlinks, cursor jump sequences, and control characters before display (`sanitizeForDisplay()`).
- **Resource Exhaustion Defense:** Capture streams are capped at 10MB (`MAX_BUFFER_BYTES`) to prevent heap exhaustion from infinite loop logging.
- **Path Traversal Prevention:** Incident IDs are strictly validated as positive integers (`/^\d+$/`). Storage directories use `0o700` and record files use `0o600` file permissions.

See [`SECURITY.md`](./SECURITY.md) for full threat model and mitigations.

---

## 8. Tested Platforms & Limitations

### Platform Testing Matrix
- **Windows 11 (x64):** **VERIFIED** (Full test suite of 117 tests passing; live CLI execution verified).
- **Linux / POSIX:** **EXPECTED** (Standard Node.js built-ins and POSIX path semantics).
- **macOS (Darwin):** **EXPECTED** (Standard Darwin pathing and file permission models).

### Known Limitations
- **Local-Only Scope:** Records are stored within the project's local `.rewind/` folder and are not automatically synced across distributed machines.
- **Heuristic Secret Redaction:** Regex-based secret redaction captures standard token formats, but cannot mathematically guarantee detection of arbitrary or custom proprietary secret structures.

---

## 9. Hackathon Scope & AI Usage Disclosure

### Built During the Event
The entire Rewind CLI was designed, architected, implemented, hardened, and verified during this hackathon:
- CLI entry point, argument parser, router, and formatter.
- Direct `.git` filesystem metadata reader.
- Subprocess capture engine with 10MB safety bounds.
- Atomic file persistence engine with crash recovery and corruption quarantine.
- Conservative error normalizer and SHA-256 fingerprint generator.
- 5-state trust loop state machine and verification executor.
- Regression detection and linking engine.
- History timeline, detailed show inspector, and near-match search engine.
- 15 test suites covering 117 automated test cases.

### AI Tools Usage Disclosure
Antigravity (Google DeepMind) was used as an AI pair programmer for code generation, test authoring, architectural review, and documentation drafting under developer direction. All generated code and tests were audited and verified against the event's zero-dependency rules.

### External Resources
- Standard [Node.js Official Documentation](https://nodejs.org/docs/latest/api/)
- The [NO_COLOR Standard Specification](https://no-color.org/)
- Standard [Git Repository Format](https://git-scm.com/docs/gitrepository-layout)

---

## License

MIT © 2026 Rewind Contributors
