# REWIND — “Remember what fixed it.”

> **A verified-recovery ledger for the terminal.**

Rewind is a zero-dependency developer CLI tool that captures command failures, preserves diagnostic evidence, tracks remediation steps, verifies recoveries through explicit user-approved verification commands, and recalls verified solutions when identical failures recur.

---

## 1. Quick Start & Judge Evaluation Guide (60-Second Test Drive)

You can evaluate the complete failure-to-verification lifecycle in your terminal in under 60 seconds with **zero installation needed**:

```bash
# 1. Run a command that fails (Rewind captures forensic evidence & exit code)
node bin/rewind.js run node -e "console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);"

# 2. View the local recovery ledger timeline
node bin/rewind.js history

# 3. Inspect deep forensic logs, git state, and hash fingerprint
node bin/rewind.js show 1

# 4. Record suspected root cause, attempted fix, and verification command
node bin/rewind.js recover 1 \
  --cause "Connection pool size was set to 1 instead of 20" \
  --change "Increased pool size to 20 in database.config" \
  --verify-cmd 'node -e "process.exit(0);"'

# 5. Execute user-approved verification command to seal recovery
node bin/rewind.js verify 1

# 6. Re-run the failing command -> Rewind instantly detects regression & surfaces verified remedy!
node bin/rewind.js run node -e "console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);"

# 7. Run self-diagnostics to verify local installation & ledger health
node bin/rewind.js doctor

# 8. Analyze failure & recovery patterns across the repository
node bin/rewind.js patterns --explain

# 9. Query structured forensic context for coding agents
node bin/rewind.js context latest --json

# 10. Run the complete automated test suite (228 tests across 64 suites, 0 dependencies)
npm test

# 11. Audit cryptographic integrity of the local ledger
node bin/rewind.js verify-integrity

# 12. Rebuild derived incident projections from immutable journal
node bin/rewind.js rebuild
```

---

## 2. What is Rewind and Why Does It Exist?

Terminal errors happen constantly during development, testing, and CI/CD. Developers frequently lose hours rediscovering fixes for obscure errors (e.g. database connection pool exhaustion, missing native bindings, configuration syntax errors) that they or their team already solved in the past.

Command history logs *what* was typed, but not *why* it failed, *what* was changed to fix it, *which approaches failed*, or *whether* the fix was verified.

**Rewind** bridges this gap:
1. **Captures Failures:** Wraps command execution, streaming live stdout/stderr while recording exit codes, timing, environment metadata, bounded logs with SHA-256 evidence hashing, and git HEAD status upon failure.
2. **Authoritative Event Journal (`journal.jsonl`):** Implements an append-only, immutable event sourcing architecture where every lifecycle mutation is an immutable event cryptographically sealed with SHA-256.
3. **Four-Layer History-Integrity Layer:** Protects the local ledger against accidental corruption, unauthorized file modification, deleted intermediate events, reordered events, tail deletion, and derived view drift.
4. **Disposable Derived Projections (`records/`):** Incident records in `.rewind/records/` and in-memory indices are rebuildable projections derived from pure journal replay.
5. **Fingerprints Error Memory:** Conservatively normalizes transient noise (timestamps, PIDs, temporary paths, memory pointers) and computes reproducible 16-character SHA-256 fingerprints.
6. **Enforces the Trust Loop & 3-Tier State Model:** Strictly separates Incident Status (`OBSERVED`, `OPEN`, `RECOVERED`, `REGRESSED`, `RESOLVED`), Recovery Attempt Status (`PROPOSED`, `ATTEMPTED`, `FAILED`, `VERIFIED`), and Derived Evidence Flags (`STALE`, `CONTRADICTED`, `DIVERGENT_EVIDENCE`).
7. **Multi-Attempt History & Negative Memory:** Preserves every remediation attempt chronologically. When an attempt fails verification, it is permanently sealed into *Negative Memory* (`KNOWN FAILED APPROACHES`), warning developers away from repeating dead ends.
8. **Relevance-Aware Staleness Evaluation:** Detects when a verified fix may no longer apply due to major runtime changes (e.g. Node 20 to Node 22), OS platform changes, or missing environment keys—without falsely invalidating on harmless git commits or patch bumps.
9. **Contradiction vs. Divergence Analysis:** Detects when two historical verification runs under equivalent conditions produced conflicting outcomes (`CONTRADICTED`) vs cross-platform differences (`DIVERGENT_EVIDENCE`).
10. **Near-Match & Exact-Match Search:** Deterministically searches historical failures using keyword recall, Jaccard overlap, exact fingerprint matching, and strict evidence confidence labels (`EXACT MATCH: VERIFIED`, `SIMILAR: VERIFIED RECOVERY`, `LIKELY PATTERN`, `NOT PROVEN`).

---

## 3. The Verification & Trust Model

Rewind operates on strict safety and evidentiary principles:

```text
[Command Fails]
       ↓
 Incident: OBSERVED
       ↓ (rewind recover <id> --cause "..." --change "..." --verify-cmd "...")
 Incident: OPEN  |  Attempt #1: PROPOSED
       ↓ (rewind verify <id> executes explicit verification command)
       ├─ [Exit != 0] → Attempt #1: FAILED (Sealed in Negative Memory)
       │                 Incident remains OPEN for Attempt #2
       └─ [Exit == 0] → Attempt #1: VERIFIED
                         Incident: RECOVERED
                               ↓ (identical failure recurs in future)
                         New Incident: REGRESSED (links to Incident #1)
```

---

## 4. Local History-Integrity Layer (Tamper Evidence)

Rewind provides local cryptographic tamper evidence across four distinct verification layers:

```text
┌────────────────────────────────────────────────────────┐
│ Layer 1: Cryptographic Event Integrity                 │
│ Recompute eventHash = SHA-256(canonical(eventData))    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Layer 2: Cryptographic Chain Continuity                │
│ 1. Monotonically increasing sequence (1, 2, 3...)      │
│ 2. UUID eventId uniqueness                             │
│ 3. Genesis block: event[1].prevHash === 64 zeros       │
│ 4. Predecessor link: event[N].prevHash === prevChainHash
│ 5. chainHash = SHA-256(prevHash:eventHash)             │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Layer 3: Cryptographic Checkpoint Anchor               │
│ Compare journal head against .rewind/checkpoint.json   │
│ Detects tail deletion, truncation, & rewrite attacks   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Layer 4: Logical Projection Consistency                │
│ Replay journal events -> derive incident state         │
│ Verify derived records match on-disk .rewind/records/  │
└────────────────────────────────────────────────────────┘
```

### Deterministic Canonical Serialization (`canonical.js`)
To guarantee byte-level reproducibility:
- Object keys are recursively sorted using explicit UTF-16 code-unit relational comparisons (`(a < b ? -1 : (a > b ? 1 : 0))`).
- Finite IEEE-754 numbers only; `-0` is normalized to `0`; `NaN` and `Infinity` are rejected fail-closed.
- Non-serializable types (`undefined`, functions, symbols) throw `CanonicalizationError` (no silent dropping).

### Honest Security Scope
- **What It Detects:** Inconsistent file modifications, deleted intermediate events, event reordering, tail deletion, full-chain rewrites (relative to checkpoint), and derived view tampering.
- **What It Does NOT Claim:** Distributed/blockchain consensus against an attacker with full filesystem control who rewrites the journal and checkpoint simultaneously. It establishes **Local Tamper Evidence relative to a trusted checkpoint.**

### Critical Safety Invariants
* **Zero Automatic Execution of Historical Fixes:** Historical remediation is *evidence*, not authority. Rewind never executes past fixes automatically.
* **Explicit User Verification:** `rewind verify <id>` executes **only** the verification command explicitly recorded by the user for that specific incident.
* **Negative Memory is Preserved:** Failed attempts are never deleted or overwritten; they become durable warnings against repeating flawed approaches.
* **Verified vs. Likely:** A fix is only labeled `VERIFIED` after its explicit verification command exits with code `0`. Similarity search results never claim `VERIFIED` certainty for unverified records.

---

## 4. Core Commands

| Command | Description |
| :--- | :--- |
| `rewind run <command...>` | Execute a command, stream output live, and record failure evidence on non-zero exit |
| `rewind history [options]` | View failure records and recovery ledger timeline (sorted newest first) |
| `rewind show <id> [options]` | Inspect complete forensic failure snapshot, logs, environment, and recovery status |
| `rewind recover <id> [options]` | Record suspected cause, remediation change, and explicit verification command |
| `rewind verify <id>` | Execute the user-approved verification command to validate and seal the fix |
| `rewind search <query...> [options]` | Deterministically search historical failures by error message, keywords, or fingerprint |
| `rewind patterns [options]` | Analyze historical failures into deterministic, evidence-backed pattern diagnostics |
| `rewind context [latest|<id>] [options]` | Query structured forensic diagnostic context and remedies for coding agents |
| `rewind doctor [options]` | Run 15-point installation & ledger health audit with safe repair capability |
| `rewind verify-integrity [options]` | Perform read-only 4-layer cryptographic audit across hash chain and checkpoints |
| `rewind rebuild [options]` | Reconstruct derived incident projection records from the authoritative journal |

### Global Options
- `-h, --help`: Show top-level or command-specific help
- `-v, --version`: Show version (`rewind v0.1.0`)
- `--json`: Output machine-readable JSON on stdout
- `--no-color`: Disable ANSI styling (also respects standard [`NO_COLOR`](https://no-color.org))
- `--root <path>`: Specify custom project root or `.rewind` directory location
- `--limit <N>` / `-n <N>`: Limit number of results in `history`, `search`, and `patterns`
- `--fingerprint <hash>` / `-f <hash>`: Filter `patterns` report to a specific failure family
- `--explain`: Display rules, required criteria, and evidence reasoning in `patterns`

---

## 5. Pattern Intelligence Layer (`rewind patterns`)

Rewind transforms raw failure logs and verified recoveries into **deterministic, non-causal pattern diagnostics**:

```text
┌───────────────────────────┐
│     AUTHORITATIVE JOURNAL │
│       .rewind/journal.jsonl│
└─────────────┬─────────────┘
              │ Event Replay
              ▼
┌───────────────────────────┐
│   CANONICAL PROJECTIONS   │
└─────────────┬─────────────┘
              │ Evidence Analyzer
              ▼
┌───────────────────────────┐
│    EVIDENTIARY RULES      │
│  - Recurring Failures     │
│  - Recurring Regressions  │
│  - Likely Flaky (>=3 runs)│
│  - Environment Correlation│
│  - Runtime Correlation    │
│  - Command Correlation    │
│  - Repeated Failed Fixes  │
│  - Frequently Verified    │
└─────────────┬─────────────┘
              │ Honest Attribution (Causality: NOT PROVEN)
              ▼
┌───────────────────────────┐
│  REASONING & EXPLANATIONS │
│       (--explain)         │
└───────────────────────────┘
```

### Pattern Taxonomy & Strict Evidentiary Standards

1. **`RECURRING_FAILURE`**:
   - Criteria: $\ge 2$ independent incidents with identical failure fingerprint.
   - Evidence: Total occurrences, first seen, last seen, incident IDs.
2. **`RECURRING_REGRESSION`**:
   - Criteria: Verified parent incident followed by subsequent `regression.detected` event.
   - Evidence: Links to verified parent incidents, elapsed recurrence intervals.
3. **`LIKELY_FLAKY`**:
   - Criteria: $\ge 3$ runs with identical commit + normalized command identity + identical environment with mixed pass (exit 0) and failure outcomes.
   - Evidence: Pass/fail counts, pass rate %, commit hash.
4. **`ENVIRONMENT_CORRELATED`**:
   - Criteria: Requires **comparative multi-platform exposure** ($\ge 3$ observations, $\ge 75\%$ platform skew).
   - Non-causal: Flags `KNOWN_DIFFERENCE` with `Causality: NOT PROVEN`.
5. **`RUNTIME_CORRELATED`**:
   - Criteria: Requires **comparative multi-runtime exposure** ($\ge 3$ observations across $\ge 2$ Node major versions, $\ge 75\%$ skew).
6. **`COMMAND_CORRELATED`**:
   - Criteria: 100% of failure family occurrences originate from a single distinct command.
7. **`REPEATED_FAILED_RECOVERY`**:
   - Criteria: Normalized remediation hypothesis failed verification $\ge 2$ times (Negative Memory).
8. **`FREQUENTLY_VERIFIED_RECOVERY`**:
   - Criteria: Normalized remediation verified $\ge 2$ times across the failure family, reporting historical verification rate.

---

## 6. Agent-Consumption Interface (`rewind context`)

Rewind provides a structured, safe, machine-readable JSON interface for autonomous and interactive coding agents (e.g. Claude Code, Gemini CLI, Cursor, Codex, and terminal automation tools):

```bash
# Fetch structured forensic failure context, verified remedies, and negative memory
rewind context latest --json
```

See [`AGENT_INTERFACE.md`](./AGENT_INTERFACE.md) for the complete JSON Schema specification, ledger trust boundaries, anti-auto-execution policies, and generic integration patterns.

---

## 7. Self-Diagnostics & Repair (`rewind doctor`)

Rewind includes a comprehensive 15-point diagnostic and constrained safe-repair engine:

```bash
# Run diagnostics check
rewind doctor

# Output diagnostic report as machine-readable JSON
rewind doctor --json

# Execute safe repair of derived indexes and projections
rewind doctor --repair

# Preview repair operations without altering disk state
rewind doctor --repair --dry-run
```

### 15 Health Checks Evaluated:
1. **Storage Accessibility:** Validates directory accessibility across `.rewind`, `records/`, `evidence/`, `tmp/`, and `quarantine/`.
2. **Active Writer Lock:** Detects lock contention or dead writer processes on `journal.lock`.
3. **Configuration Validity:** Ensures consistent path hierarchy and project root resolution.
4. **Runtime Compatibility:** Verifies Node.js runtime engine requirements ($\ge$ 20.0.0).
5. **Journal Sequence Contiguity:** Confirms strictly contiguous, strictly monotonic sequence numbering ($1, 2, 3...$).
6. **Ledger Cryptographic Integrity (4-Layer):** Re-verifies all SHA-256 event hashes, chain links, and genesis anchors.
7. **Record & Journal Syntax Validation:** Validates JSON syntax across all journal lines and projection files.
8. **Orphan Temporary Files:** Detects and reports uncommitted `.tmp` files from aborted operations.
9. **Storage & Projection Consistency:** Verifies that derived records align with authoritative journal events.
10. **Index & Projection Rebuild Capability:** Assesses clean replayability of the authoritative journal.
11. **Secret Redaction Engine:** Tests redaction patterns against representative secret signatures.
12. **Write & Cleanup Capability:** Performs non-destructive atomic write and immediate cleanup verification.
13. **Storage Disk Usage:** Reports accurate size metrics while strictly ignoring symlink traversal.
14. **Record Metrics:** Reports total incidents, verified recoveries, and recorded regressions.
15. **Quarantine Audit:** Reports isolated corrupted files without halting system operation.

---

## 8. Scalability & Performance Benchmarks

Rewind is architected for realistic and large repository history sizes:

* **Zero Full-Rewrite Startup Overhead:** Read-only commands replay projections purely in memory without rewriting on-disk files.
* **$O(1)$ In-Memory Fingerprint Index:** Fast exact fingerprint and family lookups without $O(N)$ linear index scans.
* **Pre-Computed Query Tokenization:** Tokenizes search queries once per query instead of $N$ times.
* **Bounded Tail Slicing:** History queries retrieve only the requested window from the index tail without duplicating full datasets.

### Measured Performance Benchmarks (Standard Node.js v22 on Windows 11):

| History Scale | Startup & Index Init | History Query (10 items) | Show Single Record | Search Query (10 items) | Cryptographic Integrity | Total Heap Memory |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **100 records** | **9.38 ms** | 0.003 ms | 0.021 ms | 2.82 ms | 11.23 ms | 7.1 MB |
| **1,000 records** | **62.48 ms** | 0.003 ms | 0.018 ms | 24.71 ms | 38.65 ms | 13.4 MB |
| **10,000 records** | **121.75 ms** | 0.004 ms | 0.012 ms | 88.54 ms | 338.92 ms | 65.1 MB |
| **100,000 records** | **1,064.21 ms** | 0.005 ms | 0.024 ms | 612.38 ms | 4,092.14 ms | 422.2 MB |

---

## 9. Installation & Execution

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
# Run complete test suite (228 automated unit, integration, security, and cross-platform tests across 64 suites)
npm test

# Run syntax verification across all codebase files
npm run check
```

---

## 10. End-to-End Example Workflow

```bash
# 1. Run a command that fails
$ rewind run node -e "console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);"
FATAL: Database connection pool exhausted on port 5432
[rewind] Recorded failure as incident #1. Run "rewind show 1" to inspect.

# 2. View the incident timeline
$ rewind history
REWIND RECOVERY LEDGER (1 total incidents)
────────────────────────────────────────────────────────────────────────────────
ID      STATUS        COMMAND                        TIME         RESULT
────────────────────────────────────────────────────────────────────────────────
#1      OBSERVED      node -e "console.error(..."    just now     exit 1
────────────────────────────────────────────────────────────────────────────────

# 3. Record recovery details and verification command
$ rewind recover 1 \
    --cause "Connection pool size was set to 1 instead of 20" \
    --change "Increased pool size to 20 in database.config" \
    --verify-cmd 'node -e "process.exit(0);"'
RECOVERY RECORDED  [Incident #1]
────────────────────────────────────────────────────────────────
  New State:         FIXED
  Suspected Cause:   Connection pool size was set to 1 instead of 20
  Attempted Fix:     Increased pool size to 20 in database.config
  Verify Command:    node -e "process.exit(0);"
────────────────────────────────────────────────────────────────

Next Step:
  Run "rewind verify 1" to execute the verification command and seal this recovery.

# 4. Explicitly verify the recovery
$ rewind verify 1
[rewind:verify] Executing user-approved verification command for Incident #1:
  $ node -e "process.exit(0);"

[rewind] VERIFIED! Incident #1 successfully validated under recorded conditions.

┌────────────────────────────────────────────────────────────────────────────────┐
│ ✓ RECOVERY VERIFIED                                                            │
│                                                                                │
│ Incident:              #1                                                      │
│ Verify Command:        node -e "process.exit(0);"                              │
│ Exit Code:             0 (Success)                                             │
│ Duration:              85ms                                                    │
│ Verified At:           2026-08-29T14:20:00.000Z                                │
└────────────────────────────────────────────────────────────────────────────────┘

The verified recovery has been sealed into the ledger.

# 5. Same failure recurs weeks later -> Rewind detects regression immediately!
$ rewind run node -e "console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);"
FATAL: Database connection pool exhausted on port 5432

[rewind:REGRESSION] Failure matches previously VERIFIED Incident #1
────────────────────────────────────────────────────────────────────────────────
Historical Recovery:
  Suspected Cause:   Connection pool size was set to 1 instead of 20
  Verified Fix:      Increased pool size to 20 in database.config
  Verify Command:    node -e "process.exit(0);"

Important: Historical recovery is evidence, not an automatic fix.
Rewind never automatically replays past commands. Run "rewind show 1" for evidence.
────────────────────────────────────────────────────────────────────────────────
[rewind] Recorded recurring failure as incident #2 (REGRESSED).

# 6. Search failure memory by error terms
$ rewind search "connection pool exhausted"
SEARCH RESULTS for "connection pool exhausted" (1 candidate(s))
────────────────────────────────────────────────────────────────────────────────

[VERIFIED RECOVERY] Incident #1 [fp: 83282360] — Similarity: 86%
  Status:            VERIFIED
  Command:           node -e console.error('FATAL: Database connection pool exhausted on port 5432'); process.exit(1);
  Match Reason:      Exact query phrase match in failure output (3 matching terms: connection, pool, exhausted)
  Suspected Cause:   Connection pool size was set to 1 instead of 20
  Historical Fix:    Increased pool size to 20 in database.config
  Verify Command:    node -e "process.exit(0);"
  ✔ Verified under recorded conditions
```

---

## 11. Zero-Dependency Guarantee

Rewind is strictly compliant with the **Zero Third-Party Dependency** standard:
- **`package.json` dependencies:** `0` runtime dependencies, `0` dev dependencies.
- **Node.js standard library built-ins only:** `node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:os`, `node:test`, `node:assert/strict`.
- **No external subprocess dependencies:** Reads Git metadata directly from `.git/` filesystem structures rather than invoking `git`.
- **No network/cloud services:** 100% offline local operation. No HTTP clients, no telemetry, no cloud accounts, no external AI APIs, no SQLite or remote databases.

See [`STDLIB.md`](./STDLIB.md) for full mapping of standard library implementations.
See [`DEPENDENCY_PROOF.md`](./DEPENDENCY_PROOF.md) for automated audit verification instructions.

---

## 12. Security & Privacy Hardening

Rewind is built with privacy-by-default and terminal security:
- **Discrete Argument Process Execution:** Spawns commands directly using argument arrays with strict `shell: false` for binaries and automatic `PATHEXT` resolution on Windows, preventing shell command injection attacks.
- **Parent-to-Child Signal Propagation:** Forwards `SIGINT` and `SIGTERM` signals directly to active child processes to prevent orphaned background processes.
- **Secret Redaction:** Regex patterns redact OpenAI (`sk-...`), GitHub (`ghp_...`), AWS (`AKIA...`), Slack (`xoxb-...`), Bearer tokens, Basic Auth URLs, and PEM private keys from output displays and normalized indices.
- **Terminal Control & Overwrite Safety:** Untrusted stdout/stderr is stripped of ANSI escape sequences, OSC hyperlinks, cursor jump sequences, and trailing escape bytes. Carriage-return sequences (`\r\n`, `\r`) are normalized to `\n` to prevent terminal line overwrite spoofing.
- **Resource Exhaustion Defense:** Capture streams are capped at 10MB (`MAX_BUFFER_BYTES`) to prevent heap exhaustion from infinite loop logging.
- **Path Traversal Prevention:** Incident IDs are strictly validated as positive integers (`/^\d+$/`). Storage directories use `0o700` and record files use `0o600` file permissions.

See [`SECURITY.md`](./SECURITY.md) for full threat model and mitigations.

---

## 13. Tested Platforms & Limitations

### Platform Testing Matrix
- **Windows 10 / 11 (x64):** **VERIFIED ON PLATFORM** (Full test suite of 228 tests across 64 suites passing; live CLI execution verified). Supports `.cmd`, `.bat`, and native `.exe` binary resolution.
- **Linux (Ubuntu / Debian / Fedora / Alpine):** **EXPECTED TO WORK** (Standard POSIX `execve`, permissions, and signals).
- **macOS (Darwin / Apple Silicon & Intel):** **EXPECTED TO WORK** (Standard Darwin filesystem APIs and APFS semantics).

### Known Limitations
- **Local-Only Scope:** Records are stored within the project's local `.rewind/` folder and are not automatically synced across distributed machines.
- **Heuristic Secret Redaction:** Regex-based secret redaction captures standard token formats, but cannot mathematically guarantee detection of arbitrary or custom proprietary secret structures.

---

## 14. Hackathon Scope & AI Usage Disclosure

### Built During the Event
The entire Rewind CLI was designed, architected, implemented, hardened, and verified during this hackathon:
- CLI entry point, argument parser, router, and formatter.
- Direct `.git` filesystem metadata reader.
- Subprocess capture engine with 10MB safety bounds and signal propagation.
- Atomic file persistence engine with crash recovery and corruption quarantine.
- Conservative error normalizer and SHA-256 fingerprint generator.
- 5-state trust loop state machine and verification executor.
- Regression detection and linking engine.
- History timeline, detailed show inspector, and near-match search engine.
- Immutable event journal, 4-layer cryptographic integrity layer, and projection rebuild engine.
- 15-point self-diagnostic and safe repair command (`rewind doctor`).
- Deterministic pattern intelligence engine with `--explain` evidentiary reasoning.
- Safe, deterministic agent-consumption interface (`rewind context latest --json`).
- 64 test suites covering 228 automated test cases.

### AI Tools Usage Disclosure
Antigravity (Google DeepMind) was used as an AI pair programmer for code generation, test authoring, architectural review, and documentation drafting under developer direction. All generated code and tests were audited and verified against the event's zero-dependency rules.

### External Resources
- Standard [Node.js Official Documentation](https://nodejs.org/docs/latest/api/)
- The [NO_COLOR Standard Specification](https://no-color.org/)
- Standard [Git Repository Format](https://git-scm.com/docs/gitrepository-layout)

---

## License

MIT © 2026 Rewind Contributors
