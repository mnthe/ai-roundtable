/**
 * Data query handlers
 * Handles: get_consensus, get_round_details, get_response_detail, get_citations, get_thoughts
 */

import type { SessionManager } from '../../core/session-manager.js';
import type { AIConsensusAnalyzer } from '../../core/ai-consensus-analyzer.js';
import { getGlobalModeRegistry } from '../../modes/registry.js';
import type { DebateMode } from '../../types/index.js';
import {
  GetConsensusInputSchema,
  GetRoundDetailsInputSchema,
  GetResponseDetailInputSchema,
  GetCitationsInputSchema,
  GetThoughtsInputSchema,
} from '../../types/schemas.js';
import { createSuccessResponse, createErrorResponse, type ToolResponse } from '../tools.js';
import {
  getSessionOrError,
  isSessionError,
  groupResponsesByRound,
  wrapError,
} from './utils.js';

/**
 * Get whether groupthink detection is needed for a given mode
 */
function needsGroupthinkDetection(mode: DebateMode): boolean {
  const registry = getGlobalModeRegistry();
  const strategy = registry.getMode(mode);
  return strategy?.needsGroupthinkDetection ?? true;
}

/**
 * Handler: get_consensus
 */
export async function handleGetConsensus(
  args: unknown,
  sessionManager: SessionManager,
  aiConsensusAnalyzer: AIConsensusAnalyzer | null
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetConsensusInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Determine which round to analyze
    // If roundNumber is specified, use it; otherwise use the latest round
    const roundToAnalyze = input.roundNumber ?? session.currentRound;

    // Validate round number
    if (roundToAnalyze < 1) {
      return createErrorResponse('No rounds have been executed yet');
    }
    if (roundToAnalyze > session.currentRound) {
      return createErrorResponse(
        `Round ${roundToAnalyze} does not exist. Current round is ${session.currentRound}`
      );
    }

    // Get responses for the specific round only
    const responses = await sessionManager.getResponsesForRound(input.sessionId, roundToAnalyze);
    if (responses.length === 0) {
      return createErrorResponse(`No responses found for round ${roundToAnalyze}`);
    }

    // Analyze consensus using AI (required)
    if (!aiConsensusAnalyzer) {
      return createErrorResponse(
        'AI consensus analyzer not available. Ensure API keys are configured.'
      );
    }
    const includeGroupthink = needsGroupthinkDetection(session.mode);
    const consensus = await aiConsensusAnalyzer.analyzeConsensus(responses, session.topic, {
      includeGroupthinkDetection: includeGroupthink,
    });

    return createSuccessResponse({
      sessionId: input.sessionId,
      consensus,
      responseCount: responses.length,
      analyzedRound: roundToAnalyze,
      totalRounds: session.currentRound,
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: get_round_details
 */
export async function handleGetRoundDetails(
  args: unknown,
  sessionManager: SessionManager,
  aiConsensusAnalyzer: AIConsensusAnalyzer | null
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetRoundDetailsInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Validate round number
    if (input.roundNumber > session.currentRound) {
      return createErrorResponse(
        `Round ${input.roundNumber} has not been executed yet. Current round: ${session.currentRound}`
      );
    }

    // Get responses for this round
    const responses = await sessionManager.getResponsesForRound(input.sessionId, input.roundNumber);

    if (responses.length === 0) {
      return createErrorResponse(`No responses found for round ${input.roundNumber}`);
    }

    // Analyze consensus using AI (required)
    if (!aiConsensusAnalyzer) {
      return createErrorResponse(
        'AI consensus analyzer not available. Ensure API keys are configured.'
      );
    }
    const includeGroupthink = needsGroupthinkDetection(session.mode);
    const consensus = await aiConsensusAnalyzer.analyzeConsensus(responses, session.topic, {
      includeGroupthinkDetection: includeGroupthink,
    });

    return createSuccessResponse({
      sessionId: input.sessionId,
      roundNumber: input.roundNumber,
      responses: responses.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        position: r.position,
        reasoning: r.reasoning,
        confidence: r.confidence,
        citations: r.citations,
        toolCalls: r.toolCalls?.map((tc) => ({
          toolName: tc.toolName,
          timestamp: tc.timestamp,
        })),
        timestamp: r.timestamp,
      })),
      consensus,
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: get_response_detail
 */
export async function handleGetResponseDetail(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetResponseDetailInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Verify agent participated in this session
    if (!session.agentIds.includes(input.agentId)) {
      return createErrorResponse(
        `Agent "${input.agentId}" did not participate in session "${input.sessionId}"`
      );
    }

    // Get all responses
    const allResponses = await sessionManager.getResponses(input.sessionId);
    let agentResponses = allResponses.filter((r) => r.agentId === input.agentId);

    if (agentResponses.length === 0) {
      return createErrorResponse(`No responses found for agent "${input.agentId}" in this session`);
    }

    // Filter by round if specified
    if (input.roundNumber !== undefined) {
      const roundResponses = await sessionManager.getResponsesForRound(
        input.sessionId,
        input.roundNumber
      );
      agentResponses = roundResponses.filter((r) => r.agentId === input.agentId);

      if (agentResponses.length === 0) {
        return createErrorResponse(
          `No responses found for agent "${input.agentId}" in round ${input.roundNumber}`
        );
      }
    }

    return createSuccessResponse({
      sessionId: input.sessionId,
      agentId: input.agentId,
      agentName: agentResponses[0]!.agentName,
      roundNumber: input.roundNumber,
      responses: agentResponses.map((r) => ({
        position: r.position,
        reasoning: r.reasoning,
        confidence: r.confidence,
        citations: r.citations,
        toolCalls: r.toolCalls?.map((tc) => ({
          toolName: tc.toolName,
          timestamp: tc.timestamp,
        })),
        timestamp: r.timestamp,
      })),
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: get_citations
 */
export async function handleGetCitations(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetCitationsInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session: _session } = sessionResult;

    // Get responses based on filters
    let responses = await sessionManager.getResponses(input.sessionId);

    // Filter by round if specified
    if (input.roundNumber !== undefined) {
      responses = await sessionManager.getResponsesForRound(input.sessionId, input.roundNumber);
    }

    // Filter by agent if specified
    if (input.agentId !== undefined) {
      responses = responses.filter((r) => r.agentId === input.agentId);
    }

    // Extract all citations
    const citations = responses
      .flatMap((r) => {
        if (!r.citations || r.citations.length === 0) return [];
        return r.citations.map((c) => ({
          ...c,
          agentId: r.agentId,
          agentName: r.agentName,
          timestamp: r.timestamp,
        }));
      })
      .filter((c) => c !== null);

    // Remove duplicate citations (same URL)
    const uniqueCitations = citations.reduce(
      (acc, citation) => {
        const existing = acc.find((c) => c.url === citation.url);
        if (!existing) {
          acc.push(citation);
        }
        return acc;
      },
      [] as typeof citations
    );

    return createSuccessResponse({
      sessionId: input.sessionId,
      roundNumber: input.roundNumber,
      agentId: input.agentId,
      citations: uniqueCitations,
      totalCitations: uniqueCitations.length,
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: get_thoughts
 */
export async function handleGetThoughts(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetThoughtsInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Verify agent participated in this session
    if (!session.agentIds.includes(input.agentId)) {
      return createErrorResponse(
        `Agent "${input.agentId}" did not participate in session "${input.sessionId}"`
      );
    }

    // Get all responses for this agent
    const allResponses = await sessionManager.getResponses(input.sessionId);
    const agentResponses = allResponses.filter((r) => r.agentId === input.agentId);

    if (agentResponses.length === 0) {
      return createErrorResponse(`No responses found for agent "${input.agentId}" in this session`);
    }

    // Group responses by round
    const responsesByRound = groupResponsesByRound(agentResponses, session.agentIds.length);

    return createSuccessResponse({
      sessionId: input.sessionId,
      agentId: input.agentId,
      agentName: agentResponses[0]!.agentName,
      totalResponses: agentResponses.length,
      rounds: responsesByRound.size,
      responses: agentResponses.map((r) => ({
        position: r.position,
        reasoning: r.reasoning,
        confidence: r.confidence,
        citations: r.citations,
        toolCalls: r.toolCalls?.map((tc) => ({
          toolName: tc.toolName,
          timestamp: tc.timestamp,
        })),
        timestamp: r.timestamp,
      })),
      confidenceEvolution: agentResponses.map((r, idx) => ({
        round: idx + 1,
        confidence: r.confidence,
      })),
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}
