import { ConfidenceLevel, createStructuredDiagnostic } from '../model.js';

// Go panic / fatal error header
const GO_PANIC_HEADER_REGEX = /^(?:panic:\s*(.*)|fatal error:\s*(.*))$/m;

// Go goroutine stack frame file line: "\t/path/to/file.go:42 +0x1a" or "\tC:/path/file.go:42 +0x1a"
const GO_FILE_LINE_REGEX = /^\s+([A-Za-z]:[/\\][^:\r\n]+|\/[^:\r\n]+|[^:\r\n]+):(\d+)(?:\s+\+0x[0-9a-fA-F]+)?$/;

/**
 * Attempts to parse raw process output into a Go StructuredDiagnostic.
 *
 * @param {string} text - Raw error text (stderr or stdout)
 * @returns {import('../model.js').StructuredDiagnostic | null}
 */
export function parseGoDiagnostic(text) {
  if (!text || typeof text !== 'string') return null;

  const panicMatch = text.match(GO_PANIC_HEADER_REGEX);
  const hasGoroutine = text.includes('goroutine ') && text.includes('[running]:');

  if (!panicMatch && !hasGoroutine) {
    return null;
  }

  const errorType = panicMatch ? (panicMatch[1] ? 'panic' : 'fatal error') : 'panic';
  const message = panicMatch ? (panicMatch[1] || panicMatch[2] || '').trim() : '';

  const lines = text.split(/\r?\n/).map(l => l.trimEnd());
  const stackFrames = [];
  let currentFunc = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Function name line (not indented with tab/spaces, contains parens, e.g. "main.processData(...)")
    if (/^[A-Za-z0-9_./-]+\.[A-Za-z0-9_./-]+\(.*\)$/.test(line.trim())) {
      currentFunc = line.trim();
      continue;
    }

    // Source location line (indented with tab or spaces: "\t/path/file.go:42 +0x26")
    const fileMatch = line.match(GO_FILE_LINE_REGEX);
    if (fileMatch) {
      const file = fileMatch[1].trim();
      const lineNum = Number.parseInt(fileMatch[2], 10);
      stackFrames.push({
        function: currentFunc || null,
        file,
        line: Number.isNaN(lineNum) ? null : lineNum,
        column: null,
        raw: line.trim()
      });
      currentFunc = null;
      continue;
    }
  }

  // Primary source file is the top user frame (skipping runtime/ package frames if possible)
  let primaryFrame = stackFrames.find(f => f.file && !f.file.includes('/src/runtime/') && !f.file.includes('\\src\\runtime\\'));
  if (!primaryFrame && stackFrames.length > 0) {
    primaryFrame = stackFrames[0];
  }

  const confidence = (panicMatch || stackFrames.length > 0)
    ? ConfidenceLevel.EXACTLY_PARSED
    : ConfidenceLevel.INFERRED;

  return createStructuredDiagnostic({
    language: 'go',
    runtime: 'go',
    errorType,
    errorCode: null,
    message: message || null,
    sourceFile: primaryFrame?.file || null,
    line: primaryFrame?.line || null,
    column: null,
    stackFrames,
    nestedCause: null,
    confidence,
    confidenceByField: {
      language: ConfidenceLevel.EXACTLY_PARSED,
      errorType: ConfidenceLevel.EXACTLY_PARSED,
      errorCode: ConfidenceLevel.UNKNOWN,
      location: primaryFrame?.file ? ConfidenceLevel.EXACTLY_PARSED : ConfidenceLevel.UNKNOWN,
      message: message ? ConfidenceLevel.EXACTLY_PARSED : ConfidenceLevel.UNKNOWN
    },
    rawEvidenceSnippet: panicMatch ? panicMatch[0] : text.slice(0, 300).trim()
  });
}
