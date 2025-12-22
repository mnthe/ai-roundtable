/**
 * Exit Criteria - Determines when a debate should automatically terminate
 *
 * Supports multiple exit conditions:
 * 1. Consensus threshold - High agreement level reached
 * 2. Convergence - Positions stable across rounds
 * 3. Confidence threshold - All agents highly confident
 * 4. Max rounds - Maximum rounds reached (fallback)
 */

import type { AgentResponse, ConsensusResult } from '../types/index.js';

// ============================================
// Types
// ============================================

/**
 * Exit criteria configuration for automatic debate termination
 */
export interface ExitCriteria {
  /** Consensus agreement level threshold (default: 0.9) */
  consensusThreshold?: number;

  /** Number of rounds with stable positions to trigger convergence exit (default: 2) */
  convergenceRounds?: number;

  /** Minimum confidence level for all agents to trigger exit (default: 0.85) */
  confidenceThreshold?: number;

  /** Maximum rounds (required, existing behavior) */
  maxRounds: number;
}

/**
 * Exit reason types
 */
export type ExitReason = 'consensus' | 'convergence' | 'confidence' | 'max_rounds';

/**
 * Result of checking exit criteria
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
// Default Values
// ============================================

const DEFAULT_CONSENSUS_THRESHOLD = 0.9;
const DEFAULT_CONVERGENCE_ROUNDS = 2;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Similarity threshold for position comparison
 * Uses a lower threshold than consensus-analyzer since we're comparing
 * the same agent's positions across rounds (more strict)
 */
const POSITION_SIMILARITY_THRESHOLD = 0.7;

// ============================================
// Main Function
// ============================================

/**
 * Check if exit criteria are met for a debate
 *
 * Checks criteria in order of specificity:
 * 1. Consensus - Agreement level above threshold
 * 2. Convergence - Positions stable across N rounds
 * 3. Confidence - All agents above confidence threshold
 * 4. Max rounds - Reached maximum round count
 *
 * @param responses - Latest round responses
 * @param previousRoundResponses - All previous rounds' responses (array of arrays)
 * @param criteria - Exit criteria configuration
 * @param currentRound - Current round number (1-indexed)
 * @param consensusResult - Optional consensus result (avoids recalculation)
 * @returns ExitResult indicating whether to exit and why
 */
export function checkExitCriteria(
  responses: AgentResponse[],
  previousRoundResponses: AgentResponse[][],
  criteria: ExitCriteria,
  currentRound: number,
  consensusResult?: ConsensusResult
): ExitResult {
  const {
    consensusThreshold = DEFAULT_CONSENSUS_THRESHOLD,
    convergenceRounds = DEFAULT_CONVERGENCE_ROUNDS,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
    maxRounds,
  } = criteria;

  // Validate inputs
  if (responses.length === 0) {
    return {
      shouldExit: false,
      reason: null,
      details: 'No responses to evaluate',
    };
  }

  // Check 1: Consensus threshold
  if (consensusResult && consensusResult.agreementLevel >= consensusThreshold) {
    return {
      shouldExit: true,
      reason: 'consensus',
      details: `Consensus reached with ${(consensusResult.agreementLevel * 100).toFixed(1)}% agreement (threshold: ${(consensusThreshold * 100).toFixed(1)}%)`,
    };
  }

  // Check 2: Position convergence across rounds
  // Need at least convergenceRounds + 1 rounds to check convergence
  const allRounds = [...previousRoundResponses, responses];
  if (allRounds.length >= convergenceRounds + 1) {
    const convergenceCheck = checkPositionConvergence(allRounds, convergenceRounds);
    if (convergenceCheck.converged) {
      return {
        shouldExit: true,
        reason: 'convergence',
        details: `Positions have stabilized for ${convergenceRounds} consecutive rounds${convergenceCheck.details ? `: ${convergenceCheck.details}` : ''}`,
      };
    }
  }

  // Check 3: All agents confident
  const allConfident = responses.every((r) => r.confidence >= confidenceThreshold);
  if (allConfident && responses.length > 0) {
    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
    return {
      shouldExit: true,
      reason: 'confidence',
      details: `All ${responses.length} agents are confident (avg: ${(avgConfidence * 100).toFixed(1)}%, threshold: ${(confidenceThreshold * 100).toFixed(1)}%)`,
    };
  }

  // Check 4: Max rounds reached
  if (currentRound >= maxRounds) {
    return {
      shouldExit: true,
      reason: 'max_rounds',
      details: `Maximum rounds reached (${currentRound}/${maxRounds})`,
    };
  }

  // No exit criteria met
  return {
    shouldExit: false,
    reason: null,
    details: `Continue debate: round ${currentRound}/${maxRounds}`,
  };
}

// ============================================
// Position Convergence Detection
// ============================================

interface ConvergenceCheckResult {
  converged: boolean;
  details?: string;
}

/**
 * Check if positions have converged (stabilized) across recent rounds
 *
 * Convergence is detected when:
 * - Each agent's position remains similar across the last N rounds
 * - "Similar" means the position text hasn't changed significantly
 *
 * @param allRoundResponses - All rounds' responses (array of arrays)
 * @param convergenceRounds - Number of rounds to check for stability
 * @returns Whether positions have converged
 */
export function checkPositionConvergence(
  allRoundResponses: AgentResponse[][],
  convergenceRounds: number
): ConvergenceCheckResult {
  if (allRoundResponses.length < convergenceRounds + 1) {
    return { converged: false };
  }

  // Get the last N+1 rounds (need N+1 to compare N consecutive pairs)
  const recentRounds = allRoundResponses.slice(-convergenceRounds - 1);

  // Build a map of agent positions across rounds
  const agentPositions = new Map<string, string[]>();

  for (const round of recentRounds) {
    for (const response of round) {
      const positions = agentPositions.get(response.agentId) || [];
      positions.push(response.position);
      agentPositions.set(response.agentId, positions);
    }
  }

  // Check each agent's position stability
  let stableAgentCount = 0;
  let totalAgents = 0;
  const unstableAgents: string[] = [];

  for (const [agentId, positions] of agentPositions) {
    // Need positions from all recent rounds to check stability
    if (positions.length < convergenceRounds + 1) {
      // Agent didn't participate in all rounds - skip
      continue;
    }

    totalAgents++;

    // Check if positions are similar across consecutive rounds
    let isStable = true;
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      if (prev && curr && !arePositionsSimilar(prev, curr)) {
        isStable = false;
        break;
      }
    }

    if (isStable) {
      stableAgentCount++;
    } else {
      unstableAgents.push(agentId);
    }
  }

  // Convergence requires all participating agents to have stable positions
  if (totalAgents === 0) {
    return { converged: false };
  }

  const converged = stableAgentCount === totalAgents && totalAgents > 0;

  return {
    converged,
    details: converged
      ? `All ${totalAgents} agents maintained stable positions`
      : `${unstableAgents.length}/${totalAgents} agents still changing positions`,
  };
}

/**
 * Check if two positions are similar enough to be considered "stable"
 *
 * Uses a combination of:
 * 1. Normalized text comparison
 * 2. Word overlap (Jaccard similarity)
 *
 * @param pos1 - First position text
 * @param pos2 - Second position text
 * @returns Whether positions are similar
 */
function arePositionsSimilar(pos1: string, pos2: string): boolean {
  // Normalize positions
  const norm1 = normalizePosition(pos1);
  const norm2 = normalizePosition(pos2);

  // Quick check: identical after normalization
  if (norm1 === norm2) {
    return true;
  }

  // Calculate word-based similarity
  const similarity = calculateWordSimilarity(norm1, norm2);

  return similarity >= POSITION_SIMILARITY_THRESHOLD;
}

/**
 * Normalize position text for comparison
 */
function normalizePosition(position: string): string {
  return position
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate word-based similarity (Jaccard index)
 */
function calculateWordSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(' ').filter((w) => w.length > 2));
  const words2 = new Set(text2.split(' ').filter((w) => w.length > 2));

  if (words1.size === 0 && words2.size === 0) {
    return 1; // Both empty = identical
  }

  if (words1.size === 0 || words2.size === 0) {
    return 0; // One empty, one not = different
  }

  const intersection = [...words1].filter((w) => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create default exit criteria with only maxRounds specified
 */
export function createDefaultExitCriteria(maxRounds: number): ExitCriteria {
  return {
    maxRounds,
    consensusThreshold: DEFAULT_CONSENSUS_THRESHOLD,
    convergenceRounds: DEFAULT_CONVERGENCE_ROUNDS,
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  };
}

/**
 * Validate exit criteria configuration
 */
export function validateExitCriteria(criteria: ExitCriteria): string[] {
  const errors: string[] = [];

  if (criteria.maxRounds < 1) {
    errors.push('maxRounds must be at least 1');
  }

  if (
    criteria.consensusThreshold !== undefined &&
    (criteria.consensusThreshold < 0 || criteria.consensusThreshold > 1)
  ) {
    errors.push('consensusThreshold must be between 0 and 1');
  }

  if (criteria.convergenceRounds !== undefined && criteria.convergenceRounds < 1) {
    errors.push('convergenceRounds must be at least 1');
  }

  if (
    criteria.confidenceThreshold !== undefined &&
    (criteria.confidenceThreshold < 0 || criteria.confidenceThreshold > 1)
  ) {
    errors.push('confidenceThreshold must be between 0 and 1');
  }

  return errors;
}
