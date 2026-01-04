/**
 * Decision layer utilities for roundtable response building
 *
 * Provides consensus classification and action recommendations
 * based on response quality metrics.
 */

import { RESPONSE_CONFIG } from '../../../config/response.js';
import type { ConsensusLevel, ActionRecommendationType } from '../../../types/index.js';

const { thresholds } = RESPONSE_CONFIG;

export function classifyConsensusLevel(score: number): ConsensusLevel {
  if (score >= thresholds.highConsensus) return 'high';
  if (score >= thresholds.mediumConsensus) return 'medium';
  return 'low';
}

export function determineActionRecommendation(
  consensusLevel: ConsensusLevel,
  avgConfidence: number,
  conflictCount: number
): { type: ActionRecommendationType; reason: string } {
  if (avgConfidence >= thresholds.highConfidenceAction && consensusLevel === 'high') {
    return {
      type: 'proceed',
      reason: 'High consensus and confidence across agents',
    };
  }

  if (conflictCount > 1 || (avgConfidence < thresholds.lowConfidenceAction && conflictCount > 0)) {
    return {
      type: 'verify',
      reason: `${conflictCount} conflict(s) detected, verification recommended`,
    };
  }

  if (avgConfidence < thresholds.veryLowConfidenceAction || consensusLevel === 'low') {
    return {
      type: 'query_detail',
      reason: 'Low confidence or consensus, detailed analysis recommended',
    };
  }

  return {
    type: 'proceed',
    reason: 'Moderate consensus achieved',
  };
}
