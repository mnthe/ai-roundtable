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
 * - ROUNDTABLE_EXIT_CONFIDENCE_THRESHOLD: All agents confidence level 0-1 (default: 0.85)
 */

import { z } from 'zod';
import { getEnvBoolean, getEnvNumber } from '../utils/env.js';

/**
 * Exit criteria configuration schema
 */
export const ExitCriteriaConfigSchema = z.object({
  /** Enable automatic exit criteria checking */
  enabled: z.boolean().default(true),
  /** Agreement level to trigger early exit (0-1) */
  consensusThreshold: z.number().min(0).max(1).default(0.9),
  /** Number of rounds with stable positions to trigger exit */
  convergenceRounds: z.number().min(1).default(2),
  /** Minimum confidence level for all agents to trigger exit (0-1) */
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
});

/**
 * Exit criteria configuration type derived from schema
 */
export type ExitCriteriaConfig = z.infer<typeof ExitCriteriaConfigSchema>;

/**
 * Default exit criteria values
 */
const DEFAULTS: ExitCriteriaConfig = {
  enabled: true,
  consensusThreshold: 0.9,
  convergenceRounds: 2,
  confidenceThreshold: 0.85,
};

/**
 * Load exit criteria config from environment variables with defaults
 */
function loadConfig(): ExitCriteriaConfig {
  const consensusThreshold = getEnvNumber(
    'ROUNDTABLE_EXIT_CONSENSUS_THRESHOLD',
    DEFAULTS.consensusThreshold
  );
  const confidenceThreshold = getEnvNumber(
    'ROUNDTABLE_EXIT_CONFIDENCE_THRESHOLD',
    DEFAULTS.confidenceThreshold
  );

  return {
    enabled: getEnvBoolean('ROUNDTABLE_EXIT_ENABLED', DEFAULTS.enabled),
    consensusThreshold:
      consensusThreshold >= 0 && consensusThreshold <= 1
        ? consensusThreshold
        : DEFAULTS.consensusThreshold,
    convergenceRounds: getEnvNumber('ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS', DEFAULTS.convergenceRounds),
    confidenceThreshold:
      confidenceThreshold >= 0 && confidenceThreshold <= 1
        ? confidenceThreshold
        : DEFAULTS.confidenceThreshold,
  };
}

/**
 * Exit criteria configuration (loaded once at startup)
 */
export const EXIT_CRITERIA_CONFIG: ExitCriteriaConfig = loadConfig();
