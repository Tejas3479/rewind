# Security & Privacy Architecture

REWIND is designed with strict security, privacy, and threat-mitigation principles for developer terminals.

---

## 1. Zero-Telemetry & Privacy Invariants

- **100% Offline & Local:** Rewind does not make outbound network calls, connect to remote servers, or transmit data over the network.
- **No External AI APIs or Cloud Databases:** No failure logs, code snippets, or environment metadata are ever transmitted to third-party AI or cloud services.
- **Zero Third-Party Runtime Dependencies:** Rewind is built purely using the Node.js standard library with zero runtime packages, eliminating supply chain risks.

---

## 2. Threat Model & Mitigations

| Threat Vector | Mitigation Strategy |
| :--- | :--- |
| **Path Traversal Attacks** | Strict integer validation (`/^\d+$/`) on all incident IDs. Absolute path resolution with `path.resolve()` on root ledger options. Null-byte rejection. |
| **Terminal ANSI Injection** | All captured `stdout`/`stderr` text is treated as untrusted evidence. ANSI color escapes, OSC hyperlinks, cursor movements, and control sequences are stripped at display time. |
| **Resource Exhaustion (DoS)** | Memory buffer capped at 10MB per stream (`MAX_BUFFER_BYTES`) during process capture to prevent heap overflow from infinite logging loops. |
| **Secret & Credential Leakage** | Conservative regex redaction for API keys (OpenAI, GitHub, AWS, Slack), PEM private key headers, Bearer tokens, Basic Auth URLs, and password parameters. Environment variables are captured as names only (with strict allowlist for `NODE_ENV`, `CI`, `LANG`, `TZ`). |
| **Command Injection in Fixes** | Rewind **never** automatically executes historical recovery commands. Verification commands execute ONLY through explicit user initiation (`rewind verify <id>`). |
| **Corrupt / Malicious Records** | Schema-invalid or malformed JSON records are automatically quarantined into `.rewind/quarantine/` without crashing the CLI. |
| **File Permissions** | Ledger directories and record files are written with restrictive `0o700` and `0o600` permissions (readable/writable only by current user). |

---

## 3. Secret Redaction Limitations

Rewind applies conservative pattern matching for common secret formats (e.g., standard API token prefixes, PEM headers, URL credentials). 

> **Important Limitation:** Heuristic regex redaction reduces accidental leakage in terminal displays and logs, but cannot mathematically guarantee detection of arbitrary or custom secrets. Users should ensure their command outputs do not emit unencrypted private keys or proprietary secrets.

---

## 4. Reporting Security Vulnerabilities

To report a vulnerability, please open a private GitHub security advisory on the repository.
