import { UsageError } from '../errors.js';

/**
 * 1. Incident Status (Lifecycle of the Failure Incident)
 */
export const IncidentStatus = Object.freeze({
  OBSERVED: 'OBSERVED',     // Raw failure captured, awaiting hypothesis or remediation
  OPEN: 'OPEN',             // Active remediation/attempts in progress
  RECOVERED: 'RECOVERED',   // At least one recovery attempt succeeded and verified
  REGRESSED: 'REGRESSED',   // Recurrence of a previously verified failure fingerprint
  RESOLVED: 'RESOLVED'      // Explicitly closed / accepted solution
});

/**
 * 2. Recovery Attempt Status (Per-Remediation Lifecycle)
 */
export const RecoveryAttemptStatus = Object.freeze({
  PROPOSED: 'PROPOSED',     // Cause hypothesis recorded or change described, awaiting verification
  ATTEMPTED: 'ATTEMPTED',   // Verification initiated or executed
  FAILED: 'FAILED',         // Verification failed (Negative Memory)
  VERIFIED: 'VERIFIED'      // Explicit verification command passed (Exit 0)
});

/**
 * 3. Derived Evidence Flags (Dynamically computed from historical evidence)
 */
export const EvidenceFlags = Object.freeze({
  STALE: 'STALE',                           // Relevant runtime/config changed since verification
  CONTRADICTED: 'CONTRADICTED',             // Conflicting verification results under equivalent conditions
  DIVERGENT_EVIDENCE: 'DIVERGENT_EVIDENCE', // Different verification outcomes under different environments
  NEGATIVE_MEMORY: 'NEGATIVE_MEMORY'        // Durable record of failed approaches
});

/**
 * Backward compatibility mapping for legacy code referencing RecoveryStates.
 */
export const RecoveryStates = Object.freeze({
  OBSERVED: IncidentStatus.OBSERVED,
  SUSPECTED: IncidentStatus.OPEN,
  OPEN: IncidentStatus.OPEN,
  FIXED: IncidentStatus.OPEN,
  RECOVERED: IncidentStatus.RECOVERED,
  VERIFIED: IncidentStatus.RECOVERED,
  REGRESSED: IncidentStatus.REGRESSED,
  RESOLVED: IncidentStatus.RESOLVED
});

/**
 * Valid incident lifecycle state transitions.
 */
const VALID_INCIDENT_TRANSITIONS = {
  [IncidentStatus.OBSERVED]: new Set([
    IncidentStatus.OPEN,
    IncidentStatus.RESOLVED
  ]),
  [IncidentStatus.OPEN]: new Set([
    IncidentStatus.OPEN,
    IncidentStatus.RECOVERED,
    IncidentStatus.RESOLVED
  ]),
  [IncidentStatus.RECOVERED]: new Set([
    IncidentStatus.OPEN,
    IncidentStatus.RESOLVED
  ]),
  [IncidentStatus.REGRESSED]: new Set([
    IncidentStatus.OPEN,
    IncidentStatus.RECOVERED,
    IncidentStatus.RESOLVED
  ]),
  [IncidentStatus.RESOLVED]: new Set([
    IncidentStatus.OPEN
  ])
};

/**
 * Valid recovery attempt state transitions.
 */
const VALID_ATTEMPT_TRANSITIONS = {
  [RecoveryAttemptStatus.PROPOSED]: new Set([
    RecoveryAttemptStatus.PROPOSED,
    RecoveryAttemptStatus.ATTEMPTED,
    RecoveryAttemptStatus.FAILED,
    RecoveryAttemptStatus.VERIFIED
  ]),
  [RecoveryAttemptStatus.ATTEMPTED]: new Set([
    RecoveryAttemptStatus.FAILED,
    RecoveryAttemptStatus.VERIFIED
  ]),
  [RecoveryAttemptStatus.FAILED]: new Set([
    // Terminal state for a specific attempt (subsequent attempt created instead)
  ]),
  [RecoveryAttemptStatus.VERIFIED]: new Set([
    // Terminal state for a specific attempt
  ])
};

/**
 * Validates whether an incident state transition is legal.
 *
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export function isValidIncidentTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  if (fromState === toState) return true;
  const allowed = VALID_INCIDENT_TRANSITIONS[fromState];
  return Boolean(allowed && allowed.has(toState));
}

/**
 * Asserts a valid incident state transition or throws UsageError.
 *
 * @param {string} fromState
 * @param {string} toState
 * @param {string} incidentId
 */
export function assertValidIncidentTransition(fromState, toState, incidentId) {
  if (!isValidIncidentTransition(fromState, toState)) {
    throw new UsageError(
      `Illegal incident state transition from "${fromState}" to "${toState}" for Incident #${incidentId}.`
    );
  }
}

/**
 * Validates whether a recovery attempt transition is legal.
 *
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export function isValidAttemptTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  if (fromState === toState) return true;
  const allowed = VALID_ATTEMPT_TRANSITIONS[fromState];
  return Boolean(allowed && allowed.has(toState));
}

/**
 * Asserts a valid recovery attempt transition or throws UsageError.
 *
 * @param {string} fromState
 * @param {string} toState
 * @param {number|string} attemptId
 */
export function assertValidAttemptTransition(fromState, toState, attemptId) {
  if (!isValidAttemptTransition(fromState, toState)) {
    throw new UsageError(
      `Illegal recovery attempt state transition from "${fromState}" to "${toState}" for Attempt #${attemptId}.`
    );
  }
}

/**
 * Legacy compatibility alias for existing code.
 */
export function isValidTransition(fromState, toState) {
  return isValidIncidentTransition(fromState, toState);
}

/**
 * Legacy compatibility alias for existing code.
 */
export function assertValidTransition(fromState, toState, incidentId) {
  assertValidIncidentTransition(fromState, toState, incidentId);
}
