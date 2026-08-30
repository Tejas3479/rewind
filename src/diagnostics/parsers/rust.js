import { ConfidenceLevel, createStructuredDiagnostic } from '../model.js';

// Rust compiler error signature: "error[E0308]: mismatched types" or "error: ..."
const RUST_COMPILER_ERROR_REGEX = /^error(?:\[([A-Z0-9_]+)\])?:\s*(.*)$/m;

// Rust source location pointer: "  --> src/main.rs:42:10" or "  --> tests/test.rs:5:1"
const RUST_SOURCE_SPAN_REGEX = /^\s*-->\s+([A-Za-z]:\\[^:\r\n]+|\/[^:\r\n]+|[^:\r\n]+):(\d+)(?::(\d+))?$/m;

// Rust panic signature: "thread 'main' panicked at src/main.rs:42:10:" or "thread 'main' panicked at 'message', src/lib.rs:12:5"
const RUST_PANIC_REGEX = /thread\s+'([^']+)'\s+panicked\s+at\s+(?:'([^']+)',\s+)?([A-Za-z]:\\[^:\r\n]+|\/[^:\r\n]+|[^:\r\n]+):(\d+)(?::(\d+))?/;

/**
 * Attempts to parse raw process output into a Rust StructuredDiagnostic.
 *
 * @param {string} text - Raw error text (stderr or stdout)
 * @returns {import('../model.js').StructuredDiagnostic | null}
 */
export function parseRustDiagnostic(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Check for Rust compiler error: error[E0308]: ...
  const compMatch = text.match(RUST_COMPILER_ERROR_REGEX);
  const spanMatch = text.match(RUST_SOURCE_SPAN_REGEX);

  if (compMatch || spanMatch) {
    const errorCode = compMatch && compMatch[1] ? compMatch[1].trim() : null;
    const message = compMatch && compMatch[2] ? compMatch[2].trim() : (spanMatch ? 'Rust compiler diagnostic' : null);

    let sourceFile = null;
    let line = null;
    let column = null;

    if (spanMatch) {
      sourceFile = spanMatch[1].trim();
      const l = Number.parseInt(spanMatch[2], 10);
      const c = spanMatch[3] ? Number.parseInt(spanMatch[3], 10) : null;
      line = Number.isNaN(l) ? null : l;
      column = c !== null && !Number.isNaN(c) ? c : null;
    }

    const hasSpecificProof = Boolean(errorCode || spanMatch);
    if (!hasSpecificProof) {
      return null;
    }

    return createStructuredDiagnostic({
      language: 'rust',
      runtime: 'rustc',
      errorType: errorCode ? `CompilerError[${errorCode}]` : 'CompilerError',
      errorCode,
      message,
      sourceFile,
      line,
      column,
      stackFrames: [],
      confidence: hasSpecificProof ? ConfidenceLevel.EXACTLY_PARSED : ConfidenceLevel.INFERRED,
      confidenceByField: {
        language: ConfidenceLevel.EXACTLY_PARSED,
        errorType: ConfidenceLevel.EXACTLY_PARSED,
        errorCode: errorCode ? ConfidenceLevel.EXACTLY_PARSED : ConfidenceLevel.UNKNOWN,
        location: sourceFile ? ConfidenceLevel.EXACTLY_PARSED : ConfidenceLevel.UNKNOWN,
        message: message ? ConfidenceLevel.EXACTLY_PARSED : ConfidenceLevel.UNKNOWN
      },
      rawEvidenceSnippet: compMatch ? compMatch[0] : text.slice(0, 300).trim()
    });
  }

  // 2. Check for Rust runtime panic
  const panicMatch = text.match(RUST_PANIC_REGEX);
  if (panicMatch) {
    const threadName = panicMatch[1];
    const panicMsg = panicMatch[2] || 'explicit panic';
    const sourceFile = panicMatch[3].trim();
    const l = Number.parseInt(panicMatch[4], 10);
    const c = panicMatch[5] ? Number.parseInt(panicMatch[5], 10) : null;

    return createStructuredDiagnostic({
      language: 'rust',
      runtime: 'rustc',
      errorType: 'panic',
      errorCode: null,
      message: panicMsg,
      sourceFile,
      line: Number.isNaN(l) ? null : l,
      column: c !== null && !Number.isNaN(c) ? c : null,
      stackFrames: [],
      confidence: ConfidenceLevel.EXACTLY_PARSED,
      confidenceByField: {
        language: ConfidenceLevel.EXACTLY_PARSED,
        errorType: ConfidenceLevel.EXACTLY_PARSED,
        errorCode: ConfidenceLevel.UNKNOWN,
        location: sourceFile ? ConfidenceLevel.EXACTLY_PARSED : ConfidenceLevel.UNKNOWN,
        message: ConfidenceLevel.EXACTLY_PARSED
      },
      rawEvidenceSnippet: panicMatch[0]
    });
  }

  return null;
}
