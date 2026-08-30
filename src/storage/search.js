import { IncidentStatus } from './state.js';
import { extractNegativeMemory } from './negative_memory.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'of', 'to', 'is', 'for', 'and', 'or', 'it', 'by', 'with', 'from', 'as', 'be', 'this', 'that'
]);

/**
 * Tokenizes text into a unique set of normalized lowercase terms.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function extractTokens(text) {
  if (!text || typeof text !== 'string') return new Set();
  const rawWords = text.toLowerCase().split(/[^a-z0-9_.-]+/);
  const tokens = new Set();

  for (const word of rawWords) {
    const clean = word.replace(/^[._-]+|[._-]+$/g, '');
    if (clean.length >= 2 && !STOP_WORDS.has(clean)) {
      tokens.add(clean);
    }
  }

  return tokens;
}

/**
 * Calculates set intersection.
 *
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {Set<string>}
 */
function intersection(setA, setB) {
  const result = new Set();
  for (const elem of setA) {
    if (setB.has(elem)) {
      result.add(elem);
    }
  }
  return result;
}

/**
 * @typedef {object} SearchMatch
 * @property {string} id - Incident ID
 * @property {number} score - Similarity score in [0.0, 1.0]
 * @property {'EXACT_MATCH'|'SIMILAR_MATCH'} matchType - Strict match taxonomy
 * @property {'VERIFIED'|'LIKELY'|'NOT PROVEN'} confidence - Evidence confidence
 * @property {string} status - Incident trust loop status
 * @property {string} reason - Inspectable explanation for similarity score
 * @property {string[]} matchedTokens - Tokens from query matching the record
 * @property {number} failedAttemptsCount - Number of failed recovery attempts
 * @property {import('./record.js').IncidentRecord} record - The full incident record
 */

/**
 * Scores a single record against a search query using a transparent, deterministic multi-factor model.
 *
 * @param {string} query
 * @param {import('./record.js').IncidentRecord} record
 * @param {object} [context={}]
 * @param {string} [context.cleanQuery]
 * @param {Set<string>} [context.queryTokens]
 * @returns {SearchMatch}
 */
export function scoreRecord(query, record, context = {}) {
  const cleanQuery = context.cleanQuery || query.trim().toLowerCase();
  const fp = (record.fingerprint || '').toLowerCase();
  const isRecovered = record.status === IncidentStatus.RECOVERED || record.status === 'VERIFIED';

  // 1. Tier 1: Exact Fingerprint Match
  if (fp && (cleanQuery === fp || fp.startsWith(cleanQuery) || cleanQuery.includes(fp))) {
    const failedAttempts = extractNegativeMemory([record]);
    return {
      id: record.id,
      score: 1.0,
      matchType: 'EXACT_MATCH',
      confidence: isRecovered ? 'VERIFIED' : 'LIKELY',
      status: record.status,
      reason: isRecovered
        ? 'Exact fingerprint match — verified recovery exists under recorded conditions'
        : 'Exact fingerprint match — historical evidence exists but fix is not yet verified',
      matchedTokens: [fp],
      failedAttemptsCount: failedAttempts.length,
      record
    };
  }

  const queryTokens = context.queryTokens || extractTokens(cleanQuery);
  if (queryTokens.size === 0) {
    return {
      id: record.id,
      score: 0.0,
      matchType: 'SIMILAR_MATCH',
      confidence: 'NOT PROVEN',
      status: record.status,
      reason: 'Empty or non-distinctive search query',
      matchedTokens: [],
      failedAttemptsCount: 0,
      record
    };
  }

  const errorText = `${record.normalizedError || ''} ${record.stderr || ''}`.toLowerCase();
  const cmdText = `${record.fullCommand || ''} ${record.command || ''} ${(record.args || []).join(' ')}`.toLowerCase();

  const errorTokens = extractTokens(errorText);
  const cmdTokens = extractTokens(cmdText);

  // Fast token intersection without large object overhead
  const matchedTokens = new Set();
  for (const token of queryTokens) {
    if (errorTokens.has(token) || cmdTokens.has(token)) {
      matchedTokens.add(token);
    }
  }

  if (matchedTokens.size === 0) {
    return {
      id: record.id,
      score: 0.0,
      matchType: 'SIMILAR_MATCH',
      confidence: 'NOT PROVEN',
      status: record.status,
      reason: 'No matching tokens found',
      matchedTokens: [],
      failedAttemptsCount: 0,
      record
    };
  }

  // Calculate token metrics
  const totalRecordTokens = errorTokens.size + cmdTokens.size;
  const recall = matchedTokens.size / queryTokens.size;
  const unionSize = queryTokens.size + totalRecordTokens - matchedTokens.size;
  const jaccard = unionSize > 0 ? matchedTokens.size / unionSize : 0;

  // Substring exact phrase match bonus
  let phraseBonus = 0;
  if (cleanQuery.length >= 4 && (errorText.includes(cleanQuery) || cmdText.includes(cleanQuery))) {
    phraseBonus = 0.25;
  }

  // Executable name match bonus
  let cmdBonus = 0;
  if (record.command && cleanQuery.includes(record.command.toLowerCase())) {
    cmdBonus = 0.10;
  }

  const rawScore = (recall * 0.55) + (jaccard * 0.20) + phraseBonus + cmdBonus;
  const score = Math.min(1.0, Math.round(rawScore * 100) / 100);

  const failedAttempts = extractNegativeMemory([record]);

  // Determine trust loop confidence:
  // Critical Trust Invariant: Unverified records NEVER have VERIFIED confidence
  let confidence = 'NOT PROVEN';
  if (score >= 0.40 && isRecovered) {
    confidence = 'VERIFIED';
  } else if (score >= 0.35) {
    confidence = 'LIKELY';
  }

  // Generate inspectable reason
  const tokenList = Array.from(matchedTokens).slice(0, 5).join(', ');
  let reason = '';
  if (phraseBonus > 0) {
    reason = `Exact query phrase match in failure output (${matchedTokens.size} matching terms: ${tokenList})`;
  } else if (recall >= 0.70) {
    reason = `High token overlap in failure evidence (${matchedTokens.size}/${queryTokens.size} terms: ${tokenList})`;
  } else {
    reason = `Partial token match across command and error context (${tokenList})`;
  }

  return {
    id: record.id,
    score,
    matchType: 'SIMILAR_MATCH',
    confidence,
    status: record.status,
    reason,
    matchedTokens: Array.from(matchedTokens),
    failedAttemptsCount: failedAttempts.length,
    record
  };
}

/**
 * Searches and ranks ledger records against a query string.
 *
 * @param {string} query
 * @param {Array<import('./record.js').IncidentRecord>} records
 * @param {object} [options]
 * @param {number} [options.minScore=0.15]
 * @param {number} [options.limit]
 * @returns {SearchMatch[]}
 */
export function searchRecords(query, records = [], options = {}) {
  if (!query || typeof query !== 'string' || !records.length) {
    return [];
  }

  const minScore = options.minScore ?? 0.15;
  const cleanQuery = query.trim().toLowerCase();
  const queryTokens = extractTokens(cleanQuery);
  const context = { cleanQuery, queryTokens };

  const matches = [];

  for (const record of records) {
    const match = scoreRecord(query, record, context);
    if (match.score >= minScore) {
      matches.push(match);
    }
  }

  // Deterministic sorting: highest score first, then newest ID first
  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return Number(b.id) - Number(a.id);
  });

  if (options.limit && options.limit > 0) {
    return matches.slice(0, options.limit);
  }

  return matches;
}

