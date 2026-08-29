import crypto from 'node:crypto';

/**
 * Custom error thrown when encountering non-canonicalizable types
 * (such as NaN, Infinity, undefined, functions, or circular references).
 */
export class CanonicalizationError extends Error {
  /**
   * @param {string} message
   * @param {string} [path='']
   */
  constructor(message, path = '') {
    super(path ? `Canonicalization error at "${path}": ${message}` : `Canonicalization error: ${message}`);
    this.name = 'CanonicalizationError';
    this.path = path;
  }
}

/**
 * Recursively serializes a JavaScript value into a deterministic canonical JSON string.
 *
 * Invariants:
 * 1. Object keys are sorted using strict UTF-16 code-unit relational ordering (a < b ? -1 : (a > b ? 1 : 0)).
 * 2. Numbers:
 *    - Finite IEEE-754 numbers only.
 *    - -0 is normalized to 0.
 *    - NaN, Infinity, -Infinity throw CanonicalizationError (fail-closed, never silently converted to null).
 * 3. Disallowed Types:
 *    - undefined, functions, symbols, BigInt, and circular references throw CanonicalizationError.
 * 4. Arrays:
 *    - Elements are recursively canonicalized in strict indexed order.
 * 5. Formatting:
 *    - No extraneous whitespace around colons, commas, braces, or brackets.
 *    - UTF-8 string encoding.
 *
 * @param {unknown} value
 * @param {string} [currentPath='']
 * @param {Set<object>} [seen=new Set()]
 * @returns {string}
 */
export function canonicalStringify(value, currentPath = '', seen = new Set()) {
  if (value === null) {
    return 'null';
  }

  const type = typeof value;

  if (type === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (type === 'string') {
    return JSON.stringify(value);
  }

  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalizationError(`Non-finite number (${value}) cannot be canonicalized`, currentPath);
    }
    // Normalize -0 to 0
    if (Object.is(value, -0)) {
      return '0';
    }
    return JSON.stringify(value);
  }

  if (type === 'undefined') {
    throw new CanonicalizationError('undefined values are not allowed in canonical integrity payloads', currentPath);
  }

  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    throw new CanonicalizationError(`Type "${type}" cannot be canonicalized in JSON payloads`, currentPath);
  }

  if (type === 'object') {
    if (seen.has(value)) {
      throw new CanonicalizationError('Circular reference detected', currentPath);
    }

    seen.add(value);
    try {
      if (Array.isArray(value)) {
        const elements = [];
        for (let i = 0; i < value.length; i++) {
          const elemPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
          elements.push(canonicalStringify(value[i], elemPath, seen));
        }
        return `[${elements.join(',')}]`;
      }

      // Check if it's a plain object or has a custom toJSON
      const proto = Object.getPrototypeOf(value);
      if (proto !== null && proto !== Object.prototype) {
        if (value instanceof Date) {
          return JSON.stringify(value.toISOString());
        }
        // If it's another object type, treat enumerable keys canonically
      }

      // Sort keys strictly by UTF-16 code-unit order using explicit relational operators
      const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
      const entries = [];

      for (const key of keys) {
        const val = value[key];
        const keyPath = currentPath ? `${currentPath}.${key}` : key;
        const valStr = canonicalStringify(val, keyPath, seen);
        entries.push(`${JSON.stringify(key)}:${valStr}`);
      }

      return `{${entries.join(',')}}`;
    } finally {
      seen.delete(value);
    }
  }

  throw new CanonicalizationError(`Unsupported value type: ${type}`, currentPath);
}

/**
 * Computes the SHA-256 digest of a value after canonical serialization.
 *
 * @param {unknown} value
 * @returns {string} - 64-character lowercase hex string
 */
export function computeCanonicalDigest(value) {
  const canonicalJson = canonicalStringify(value);
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
