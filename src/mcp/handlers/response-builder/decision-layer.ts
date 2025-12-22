/**
 * Decision layer utilities for roundtable response building
 *
 * Provides consensus classification and action recommendations
 * based on response quality metrics.
 */

import type { ConsensusLevel, ActionRecommendationType } from '../../../types/index.js';

/**
 * Classify consensus level from numeric score
 */
export function classifyConsensusLevel(score: number): ConsensusLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Determine action recommendation based on confidence and conflicts
 */
export function determineActionRecommendation(
  consensusLevel: ConsensusLevel,
  avgConfidence: number,
  conflictCount: number
): { type: ActionRecommendationType; reason: string } {
  // High confidence + high consensus = proceed
  if (avgConfidence >= 0.8 && consensusLevel === 'high') {
    return {
      type: 'proceed',
      reason: 'High consensus and confidence across agents',
    };
  }

  // Multiple conflicts or high impact uncertainties = verify
  if (conflictCount > 1 || (avgConfidence < 0.6 && conflictCount > 0)) {
    return {
      type: 'verify',
      reason: `${conflictCount} conflict(s) detected, verification recommended`,
    };
  }

  // Low confidence or consensus = query for more details
  if (avgConfidence < 0.5 || consensusLevel === 'low') {
    return {
      type: 'query_detail',
      reason: 'Low confidence or consensus, detailed analysis recommended',
    };
  }

  // Default: proceed with caution
  return {
    type: 'proceed',
    reason: 'Moderate consensus achieved',
  };
}
