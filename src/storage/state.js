import { UsageError } from '../errors.js';

/**
 * The 5 strict canonical states of the Rewind Trust Loop.
 */
export const RecoveryStates = Object.freeze({
  OBSERVED: 'OBSERVED',
  SUSPECTED: 'SUSPECTED',
  FIXED: 'FIXED',
  VERIFIED: 'VERIFIED',
  REGRESSED: 'REGRESSED'
});

/**
 * Valid state transitions table.
 */
const VALID_TRANSITIONS = {
  [RecoveryStates.OBSERVED]: new Set([
    RecoveryStates.SUSPECTED,
    RecoveryStates.FIXED
  ]),
  [RecoveryStates.SUSPECTED]: new Set([
    RecoveryStates.SUSPECTED,
    RecoveryStates.FIXED
  ]),
  [RecoveryStates.FIXED]: new Set([
    RecoveryStates.FIXED,
    RecoveryStates.VERIFIED
  ]),
  [RecoveryStates.VERIFIED]: new Set([
    RecoveryStates.REGRESSED
  ]),
  [RecoveryStates.REGRESSED]: new Set([
    RecoveryStates.SUSPECTED,
    RecoveryStates.FIXED
  ])
};

/**
 * Validates whether a state transition is legal according to the trust loop rules.
 *
 * @param {string} fromState - Current state
 * @param {string} toState - Proposed next state
 * @returns {boolean}
 */
export function isValidTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  const allowed = VALID_TRANSITIONS[fromState];
  return Boolean(allowed && allowed.has(toState));
}

/**
 * Asserts a valid state transition or throws a structured UsageError.
 *
 * @param {string} fromState
 * @param {string} toState
 * @param {string} incidentId
 */
export function assertValidTransition(fromState, toState, incidentId) {
  if (!isValidTransition(fromState, toState)) {
    throw new UsageError(
      `Illegal trust loop state transition from "${fromState}" to "${toState}" for Incident #${incidentId}.`
    );
  }
}
