/**
 * Response builder utilities for MCP handlers (4-Layer Structure)
 */

import type {
  AgentResponse,
  RoundResult,
  RoundtableResponse,
  ConsensusLevel,
  ActionRecommendationType,
  AgentResponseSummary,
  Session,
  ContextRequest,
  RoundtableStatus,
} from '../../types/index.js';

/**
 * Classify consensus level from numeric score
 */
function classifyConsensusLevel(score: number): ConsensusLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Determine action recommendation based on confidence and conflicts
 */
function determineActionRecommendation(
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

/**
 * Extract 2-3 key points from full reasoning
 */
function extractKeyPoints(reasoning: string): string[] {
  const keyPoints: string[] = [];

  // Try to extract numbered points (1., 2., etc.) or bullet points
  const numberedMatches = reasoning.match(/(?:^|\n)\s*(?:\d+[.):]\s*|\*\s*|-\s*)\*?\*?([^\n*]+)/g);
  if (numberedMatches && numberedMatches.length > 0) {
    for (const match of numberedMatches.slice(0, 3)) {
      const cleaned = match.replace(/^\s*(?:\d+[.):]\s*|\*\s*|-\s*)\*?\*?/, '').trim();
      if (cleaned.length > 10) {
        keyPoints.push(cleaned);
      }
    }
  }

  // Fallback: extract first 2-3 sentences if no bullet points found
  if (keyPoints.length === 0) {
    const sentences = reasoning.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    for (const sentence of sentences.slice(0, 3)) {
      const cleaned = sentence.trim();
      if (cleaned.length > 10) {
        keyPoints.push(cleaned);
      }
    }
  }

  // Ensure we have at least something
  if (keyPoints.length === 0) {
    keyPoints.push(reasoning.trim() || 'No reasoning provided');
  }

  return keyPoints;
}

/**
 * Detect conflicts between agent responses
 */
function detectConflicts(
  responses: AgentResponse[]
): { issue: string; positions: { agentId: string; stance: string }[] }[] {
  const conflicts: { issue: string; positions: { agentId: string; stance: string }[] }[] = [];

  // Simple conflict detection: check if positions are significantly different
  if (responses.length < 2) return conflicts;

  // Extract position keywords and compare
  const positionKeywords = responses.map((r) => ({
    agentId: r.agentId,
    position: r.position,
    keywords: r.position
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4),
  }));

  // Check confidence variance as indicator of disagreement
  const confidences = responses.map((r) => r.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const confidenceVariance =
    confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length;

  if (confidenceVariance > 0.04) {
    // Significant confidence variance
    conflicts.push({
      issue: 'Confidence levels',
      positions: responses.map((r) => ({
        agentId: r.agentId,
        stance: `${(r.confidence * 100).toFixed(0)}% confident`,
      })),
    });
  }

  // Check for opposing stance indicators
  const opposingPairs: [string, string][] = [
    ['better', 'worse'],
    ['agree', 'disagree'],
    ['support', 'oppose'],
    ['yes', 'no'],
    ['positive', 'negative'],
  ];

  for (const pair of opposingPairs) {
    const word1 = pair[0];
    const word2 = pair[1];
    const stances: { agentId: string; stance: string }[] = [];
    for (const pk of positionKeywords) {
      const hasWord1 = pk.position.toLowerCase().includes(word1);
      const hasWord2 = pk.position.toLowerCase().includes(word2);
      if (hasWord1 && !hasWord2) {
        stances.push({ agentId: pk.agentId, stance: word1 });
      } else if (hasWord2 && !hasWord1) {
        stances.push({ agentId: pk.agentId, stance: word2 });
      }
    }
    if (stances.length >= 2 && new Set(stances.map((s) => s.stance)).size > 1) {
      conflicts.push({ issue: `${word1} vs ${word2}`, positions: stances });
    }
  }

  return conflicts.slice(0, 3); // Limit to 3 most relevant conflicts
}

/**
 * Build verification hints based on response quality
 */
function buildVerificationHints(
  responses: AgentResponse[],
  _sessionId: string
): { field: string; reason: string; suggestedTool: string }[] {
  const hints: { field: string; reason: string; suggestedTool: string }[] = [];

  // Check for low confidence agents
  const lowConfidenceAgents = responses.filter((r) => r.confidence < 0.6);
  if (lowConfidenceAgents.length > 0) {
    hints.push({
      field: 'Agent confidence',
      reason: `${lowConfidenceAgents.length} agent(s) have low confidence`,
      suggestedTool: 'get_thoughts',
    });
  }

  // Check for agents without citations
  const noCitationAgents = responses.filter((r) => !r.citations || r.citations.length === 0);
  if (noCitationAgents.length > 0 && noCitationAgents.length < responses.length) {
    hints.push({
      field: 'Evidence sources',
      reason: `${noCitationAgents.length} agent(s) provided no citations`,
      suggestedTool: 'get_citations',
    });
  }

  // Check for significant reasoning length variance
  const reasoningLengths = responses.map((r) => r.reasoning.length);
  const avgLength = reasoningLengths.reduce((a, b) => a + b, 0) / reasoningLengths.length;
  const shortReasoningAgents = responses.filter((r) => r.reasoning.length < avgLength * 0.5);
  if (shortReasoningAgents.length > 0) {
    hints.push({
      field: 'Reasoning depth',
      reason: `${shortReasoningAgents.length} agent(s) provided shorter reasoning`,
      suggestedTool: 'get_round_details',
    });
  }

  return hints.slice(0, 3);
}

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
