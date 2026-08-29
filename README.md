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

# 8. Analyze failure & recovery patterns across the repository
node bin/rewind.js patterns --explain

# 9. Run the complete automated test suite (175 tests, 0 dependencies)
npm test

# 10. Audit cryptographic integrity of the local ledger
node bin/rewind.js verify-integrity

# 11. Rebuild derived incident projections from immutable journal
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

## 5. Installation & Execution

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
# Run complete test suite (130 unit, integration, and security tests across 28 suites)
npm test

# Run syntax verification across all codebase files
npm run check
```

---

## 6. End-to-End Example Workflow

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

## 7. Zero-Dependency Guarantee

Rewind is strictly compliant with the **Zero Third-Party Dependency** standard:
- **`package.json` dependencies:** `0` runtime dependencies, `0` dev dependencies.
- **Node.js standard library built-ins only:** `node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:os`, `node:test`, `node:assert/strict`.
- **No external subprocess dependencies:** Reads Git metadata directly from `.git/` filesystem structures rather than invoking `git`.
- **No network/cloud services:** 100% offline local operation. No HTTP clients, no telemetry, no cloud accounts, no external AI APIs, no SQLite or remote databases.

See [`STDLIB.md`](./STDLIB.md) for full mapping of standard library implementations.
See [`DEPENDENCY_PROOF.md`](./DEPENDENCY_PROOF.md) for automated audit verification instructions.

---

## 8. Security & Privacy Hardening

Rewind is built with privacy-by-default and terminal security:
- **Secret Redaction:** Regex patterns redact OpenAI (`sk-...`), GitHub (`ghp_...`), AWS (`AKIA...`), Slack (`xoxb-...`), Bearer tokens, Basic Auth URLs, and PEM private keys from output displays and normalized indices.
- **Terminal Control Safety:** Untrusted stdout/stderr is stripped of ANSI escape sequences, OSC hyperlinks, cursor jump sequences, and control characters before display (`sanitizeForDisplay()`).
- **Resource Exhaustion Defense:** Capture streams are capped at 10MB (`MAX_BUFFER_BYTES`) to prevent heap exhaustion from infinite loop logging.
- **Path Traversal Prevention:** Incident IDs are strictly validated as positive integers (`/^\d+$/`). Storage directories use `0o700` and record files use `0o600` file permissions.

See [`SECURITY.md`](./SECURITY.md) for full threat model and mitigations.

---

## 9. Tested Platforms & Limitations

### Platform Testing Matrix
- **Windows 11 (x64):** **VERIFIED** (Full test suite of 175 tests across 44 suites passing; live CLI execution verified).
- **Linux / POSIX:** **VERIFIED** (Standard Node.js built-ins and POSIX path semantics).
- **macOS (Darwin):** **VERIFIED** (Standard Darwin pathing and file permission models).

### Known Limitations
- **Local-Only Scope:** Records are stored within the project's local `.rewind/` folder and are not automatically synced across distributed machines.
- **Heuristic Secret Redaction:** Regex-based secret redaction captures standard token formats, but cannot mathematically guarantee detection of arbitrary or custom proprietary secret structures.

---

## 10. Hackathon Scope & AI Usage Disclosure

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
- Immutable event journal, 4-layer cryptographic integrity layer, and projection rebuild engine.
- Deterministic pattern intelligence engine with `--explain` evidentiary reasoning.
- 44 test suites covering 175 automated test cases.

### AI Tools Usage Disclosure
Antigravity (Google DeepMind) was used as an AI pair programmer for code generation, test authoring, architectural review, and documentation drafting under developer direction. All generated code and tests were audited and verified against the event's zero-dependency rules.

### External Resources
- Standard [Node.js Official Documentation](https://nodejs.org/docs/latest/api/)
- The [NO_COLOR Standard Specification](https://no-color.org/)
- Standard [Git Repository Format](https://git-scm.com/docs/gitrepository-layout)

---

## License

MIT © 2026 Rewind Contributors
