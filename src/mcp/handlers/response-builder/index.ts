/**
 * Response builder facade for MCP handlers (4-Layer Structure)
 *
 * This module provides the main buildRoundtableResponse function
 * that orchestrates the 4-layer response building process.
 */

import type {
  AgentResponse,
  RoundResult,
  RoundtableResponse,
  AgentResponseSummary,
  Session,
  ContextRequest,
  RoundtableStatus,
} from '../../../types/index.js';

import { classifyConsensusLevel, determineActionRecommendation } from './decision-layer.js';
import { extractKeyPoints, detectConflicts } from './analysis-layer.js';
import { buildVerificationHints } from './metadata-layer.js';

// Re-export sub-module functions for direct access if needed
export { classifyConsensusLevel, determineActionRecommendation } from './decision-layer.js';
export { extractKeyPoints, detectConflicts } from './analysis-layer.js';
export { buildVerificationHints } from './metadata-layer.js';

/**
 * Build the 4-layer roundtable response
 *
 * @param session - The debate session
 * @param roundResult - The round result containing responses and consensus
 * @param previousResponses - Previous round responses for confidence change calculation
 * @param keyPointsMap - Pre-extracted key points map (agentId -> keyPoints[])
 * @param contextRequests - Pending context requests from agents (optional)
 */
export function buildRoundtableResponse(
  session: Session,
  roundResult: RoundResult,
  previousResponses: AgentResponse[] = [],
  keyPointsMap: Map<string, string[]> = new Map(),
  contextRequests: ContextRequest[] = []
): RoundtableResponse {
  const responses = roundResult.responses;
  const consensus = roundResult.consensus;

  // Calculate average confidence
  const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

  // Classify consensus level
  const consensusLevel = classifyConsensusLevel(consensus.agreementLevel);

  // Detect conflicts
  const conflicts = detectConflicts(responses);

  // Determine action recommendation
  const actionRecommendation = determineActionRecommendation(
    consensusLevel,
    avgConfidence,
    conflicts.length
  );

  // Build agent response summaries (Layer 2)
  const agentResponses: AgentResponseSummary[] = responses.map((r) => {
    // Find previous confidence for this agent
    const prevResponse = previousResponses.find((pr) => pr.agentId === r.agentId);
    const confidenceChange = prevResponse
      ? {
          delta: r.confidence - prevResponse.confidence,
          previousRound: roundResult.roundNumber - 1,
          reason:
            r.confidence > prevResponse.confidence
              ? 'Position strengthened'
              : r.confidence < prevResponse.confidence
                ? 'Position reconsidered'
                : 'Position maintained',
        }
      : undefined;

    // Count evidence used
    const webSearches =
      r.toolCalls?.filter(
        (tc) =>
          tc.toolName.includes('search') ||
          tc.toolName.includes('web') ||
          tc.toolName.includes('perplexity')
      ).length || 0;
    const citations = r.citations?.length || 0;
    const toolCalls = [...new Set(r.toolCalls?.map((tc) => tc.toolName) || [])];

    // Use AI-extracted key points if available, fallback to rule-based
    const keyPoints = keyPointsMap.get(r.agentId) ?? extractKeyPoints(r.reasoning);

    return {
      agentId: r.agentId,
      agentName: r.agentName,
      stance: r.stance,
      position: r.position,
      keyPoints,
      confidence: r.confidence,
      confidenceChange,
      evidenceUsed: {
        webSearches,
        citations,
        toolCalls,
      },
    };
  });

  // Total citations (Layer 3)
  const totalCitations = responses.reduce((sum, r) => sum + (r.citations?.length || 0), 0);

  // Build verification hints (Layer 4)
  const verificationHints = buildVerificationHints(responses, session.id);

  // Determine status based on context requests
  const hasRequiredRequests = contextRequests.some((r) => r.priority === 'required');
  const status: RoundtableStatus =
    contextRequests.length > 0 && hasRequiredRequests
      ? 'needs_context'
      : session.currentRound >= session.totalRounds
        ? 'completed'
        : 'in_progress';

  const result: RoundtableResponse = {
    sessionId: session.id,
    topic: session.topic,
    mode: session.mode,
    roundNumber: roundResult.roundNumber,
    totalRounds: session.totalRounds,

    // Status indicating if context is needed
    status,

    // Layer 1: Decision
    decision: {
      consensusLevel,
      agreementScore: consensus.agreementLevel,
      actionRecommendation,
    },

    // Layer 2: Agent Responses
    agentResponses,

    // Layer 3: Evidence
    evidence: {
      totalCitations,
      conflicts,
      consensusSummary:
        consensus.summary.length > 200
          ? consensus.summary.substring(0, 200) + '...'
          : consensus.summary,
    },

    // Layer 4: Metadata
    metadata: {
      detailReference: {
        tool: 'get_round_details',
        params: {
          sessionId: session.id,
          roundNumber: roundResult.roundNumber,
        },
      },
      verificationHints,
      hasMoreDetails: true,
    },
  };

  // Add context requests if present
  if (contextRequests.length > 0) {
    result.contextRequests = contextRequests;
  }

  return result;
}
