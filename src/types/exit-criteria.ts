/**
 * Exit criteria types for debate termination
 *
 * These types are used by the core/exit-criteria.ts module to determine
 * when a debate should automatically terminate.
 */

// ============================================
// Exit Reason Types
// ============================================

/**
 * Reasons for debate termination
 */
export type ExitReason = 'consensus' | 'convergence' | 'confidence' | 'max_rounds';

// ============================================
// Exit Result Types
// ============================================

/**
 * Result of exit criteria check
 */
export interface ExitResult {
  /** Whether the debate should exit */
  shouldExit: boolean;

  /** Reason for exit (null if shouldExit is false) */
  reason: ExitReason | null;

  /** Human-readable explanation */
  details: string;
}

// ============================================
// Exit Criteria Configuration
// ============================================

/**
 * Configuration for exit criteria thresholds
 */
export interface ExitCriteria {
  /** Maximum rounds (required, existing behavior) */
  maxRounds: number;

  /** Consensus agreement level threshold (default: 0.9) */
  consensusThreshold?: number;

  /** Number of rounds with stable positions to trigger convergence exit (default: 2) */
  convergenceRounds?: number;

  /** Minimum confidence level for all agents to trigger exit (default: 0.85) */
  confidenceThreshold?: number;
}
