/**
 * Exit Criteria Configuration
 *
 * Configures automatic early termination of debates when consensus is reached.
 * Can be customized via environment variables.
 *
 * Environment variables:
 * - ROUNDTABLE_EXIT_ENABLED: Enable/disable exit criteria (default: true)
 * - ROUNDTABLE_EXIT_CONSENSUS_THRESHOLD: Agreement level 0-1 (default: 0.9)
 * - ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS: Stable rounds required (default: 2)
 */

import { getEnvBoolean, getEnvNumber } from '../utils/env.js';

/**
 * Exit criteria configuration
 */
export interface ExitCriteriaConfig {
  /** Enable automatic exit criteria checking */
  enabled: boolean;
  /** Agreement level to trigger early exit (0-1) */
  consensusThreshold: number;
  /** Number of rounds with stable positions to trigger exit */
  convergenceRounds: number;
}

/**
 * Default exit criteria values
 */
const DEFAULTS: ExitCriteriaConfig = {
  enabled: true,
  consensusThreshold: 0.9,
  convergenceRounds: 2,
};

/**
 * Load exit criteria config from environment variables with defaults
 */
function loadConfig(): ExitCriteriaConfig {
  const threshold = getEnvNumber('ROUNDTABLE_EXIT_CONSENSUS_THRESHOLD', DEFAULTS.consensusThreshold);

  return {
    enabled: getEnvBoolean('ROUNDTABLE_EXIT_ENABLED', DEFAULTS.enabled),
    consensusThreshold: threshold >= 0 && threshold <= 1 ? threshold : DEFAULTS.consensusThreshold,
    convergenceRounds: getEnvNumber('ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS', DEFAULTS.convergenceRounds),
  };
}

/**
 * Exit criteria configuration (loaded once at startup)
 */
export const EXIT_CRITERIA_CONFIG: ExitCriteriaConfig = loadConfig();
