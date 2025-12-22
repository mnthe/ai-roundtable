/**
 * Export functionality handlers
 * Handles: export_session, synthesize_debate
 */

import { jsonrepair } from 'jsonrepair';
import type { SessionManager } from '../../core/session-manager.js';
import type { AgentRegistry } from '../../agents/registry.js';
import type { AgentResponse, SynthesisResult, SynthesisContext } from '../../types/index.js';
import { ExportSessionInputSchema, SynthesizeDebateInputSchema } from '../../types/schemas.js';
import { createSuccessResponse, createErrorResponse, type ToolResponse } from '../tools.js';
import { createLogger } from '../../utils/logger.js';
import {
  getSessionOrError,
  isSessionError,
  groupResponsesByRound,
  wrapError,
} from './utils.js';
import { ERROR_MESSAGES } from './constants.js';

const logger = createLogger('ExportHandlers');

/**
 * Handler: export_session
 */
export async function handleExportSession(
  args: unknown,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = ExportSessionInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Get all responses
    const responses = await sessionManager.getResponses(input.sessionId);

    if (input.format === 'json') {
      // JSON format: return full structured data
      return createSuccessResponse({
        session: {
          id: session.id,
          topic: session.topic,
          mode: session.mode,
          status: session.status,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        agents: session.agentIds.map((id) => {
          const agent = agentRegistry.getAgent(id);
          return agent
            ? agent.getInfo()
            : { id, name: 'Unknown', provider: 'unknown' as const, model: 'unknown' };
        }),
        responses: responses.map((r) => ({
          agentId: r.agentId,
          agentName: r.agentName,
          position: r.position,
          reasoning: r.reasoning,
          confidence: r.confidence,
          citations: r.citations,
          toolCalls: r.toolCalls,
          timestamp: r.timestamp,
        })),
        consensus: session.consensus,
      });
    } else {
      // Markdown format
      const lines: string[] = [];

      // Title
      lines.push(`# Debate Session: ${session.topic}`);
      lines.push('');

      // Metadata
      lines.push('## Session Information');
      lines.push('');
      lines.push(`- **Session ID:** ${session.id}`);
      lines.push(`- **Mode:** ${session.mode}`);
      lines.push(`- **Status:** ${session.status}`);
      lines.push(`- **Rounds:** ${session.currentRound} / ${session.totalRounds}`);
      lines.push(`- **Created:** ${session.createdAt.toISOString()}`);
      lines.push(`- **Updated:** ${session.updatedAt.toISOString()}`);
      lines.push('');

      // Participants
      lines.push('## Participants');
      lines.push('');
      for (const agentId of session.agentIds) {
        const agent = agentRegistry.getAgent(agentId);
        if (agent) {
          const info = agent.getInfo();
          lines.push(`- **${info.name}** (${info.provider} / ${info.model})`);
        } else {
          lines.push(`- ${agentId}`);
        }
      }
      lines.push('');

      // Responses by round
      const responsesByRound = groupResponsesByRound(responses, session.agentIds.length);

      for (const [round, roundResponses] of Array.from(responsesByRound.entries()).sort(
        ([a], [b]) => a - b
      )) {
        lines.push(`## Round ${round}`);
        lines.push('');

        for (const response of roundResponses) {
          lines.push(`### ${response.agentName}`);
          lines.push('');
          lines.push(`**Position:** ${response.position}`);
          lines.push('');
          lines.push(`**Confidence:** ${(response.confidence * 100).toFixed(1)}%`);
          lines.push('');
          lines.push('**Reasoning:**');
          lines.push('');
          lines.push(response.reasoning);
          lines.push('');

          if (response.citations && response.citations.length > 0) {
            lines.push('**Citations:**');
            lines.push('');
            for (const citation of response.citations) {
              lines.push(`- [${citation.title}](${citation.url})`);
              if (citation.snippet) {
                lines.push(`  > ${citation.snippet}`);
              }
            }
            lines.push('');
          }

          if (response.toolCalls && response.toolCalls.length > 0) {
            lines.push(`**Tools Used:** ${response.toolCalls.map((tc) => tc.toolName).join(', ')}`);
            lines.push('');
          }
        }
      }

      // Consensus
      if (session.consensus) {
        lines.push('## Consensus Analysis');
        lines.push('');
        lines.push(`**Agreement Level:** ${(session.consensus.agreementLevel * 100).toFixed(1)}%`);
        lines.push('');

        if (session.consensus.commonGround.length > 0) {
          lines.push('**Common Ground:**');
          lines.push('');
          for (const point of session.consensus.commonGround) {
            lines.push(`- ${point}`);
          }
          lines.push('');
        }

        if (session.consensus.disagreementPoints.length > 0) {
          lines.push('**Disagreement Points:**');
          lines.push('');
          for (const point of session.consensus.disagreementPoints) {
            lines.push(`- ${point}`);
          }
          lines.push('');
        }

        lines.push('**Summary:**');
        lines.push('');
        lines.push(session.consensus.summary);
      }

      return createSuccessResponse({
        format: 'markdown',
        content: lines.join('\n'),
      });
    }
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: synthesize_debate
 */
export async function handleSynthesizeDebate(
  args: unknown,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = SynthesizeDebateInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Get all responses
    const responses = await sessionManager.getResponses(input.sessionId);
    if (responses.length === 0) {
      return createErrorResponse(ERROR_MESSAGES.SESSION_NO_RESPONSES);
    }

    // Determine synthesizer agent
    let synthesizerId = input.synthesizer;
    if (!synthesizerId) {
      // Use first active agent as default
      const activeAgentIds = agentRegistry.getActiveAgentIds();
      if (activeAgentIds.length === 0) {
        return createErrorResponse(ERROR_MESSAGES.NO_ACTIVE_AGENTS);
      }
      synthesizerId = activeAgentIds[0]!;
    }

    // Verify synthesizer exists
    const synthesizerAgent = agentRegistry.getAgent(synthesizerId);
    if (!synthesizerAgent) {
      return createErrorResponse(ERROR_MESSAGES.SYNTHESIZER_NOT_FOUND(synthesizerId));
    }

    // Build synthesis prompt
    const synthesisPrompt = buildSynthesisPrompt(session.topic, responses, session.mode);

    // Create synthesis context with the proper format
    const synthesisContext: SynthesisContext = {
      sessionId: session.id,
      topic: session.topic,
      mode: session.mode,
      responses: responses,
      synthesisPrompt: synthesisPrompt,
    };

    // Generate synthesis using the dedicated synthesis method
    // This ensures the synthesis-specific prompts are used (not debate format)
    const synthesisResponse = await synthesizerAgent.generateSynthesis(synthesisContext);

    // Parse the agent response to extract synthesis result
    const synthesis = parseSynthesisResponse(synthesisResponse, synthesizerId);

    return createSuccessResponse({
      sessionId: input.sessionId,
      synthesizerId: synthesizerId,
      synthesis: synthesis,
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Build synthesis prompt from debate responses
 */
function buildSynthesisPrompt(topic: string, responses: AgentResponse[], mode: string): string {
  const parts: string[] = [];

  parts.push(`You are analyzing a debate on the topic: "${topic}"`);
  parts.push(`Debate mode: ${mode}`);
  parts.push('');

  // Group responses by round
  const agentsInSession = new Set(responses.map((r) => r.agentId));
  const agentsPerRound = agentsInSession.size;
  const responsesByRound = groupResponsesByRound(responses, agentsPerRound);

  const totalRounds = responsesByRound.size;
  parts.push(
    `The debate had ${totalRounds} rounds with the following participants: ${Array.from(agentsInSession).join(', ')}`
  );
  parts.push('');

  // Add all responses
  parts.push('Here are all the positions and reasoning from each round:');
  parts.push('');

  for (const [round, roundResponses] of Array.from(responsesByRound.entries()).sort(
    ([a], [b]) => a - b
  )) {
    parts.push(`--- Round ${round} ---`);
    for (const response of roundResponses) {
      parts.push(`${response.agentName}:`);
      parts.push(`Position: ${response.position}`);
      parts.push(`Reasoning: ${response.reasoning}`);
      parts.push(`Confidence: ${(response.confidence * 100).toFixed(0)}%`);
      if (response.citations && response.citations.length > 0) {
        parts.push(`Citations: ${response.citations.map((c) => c.title).join(', ')}`);
      }
      parts.push('');
    }
  }

  parts.push(
    'Please analyze this debate and provide a comprehensive synthesis in JSON format with the following structure:'
  );
  parts.push('{');
  parts.push('  "commonGround": ["Key point 1", "Key point 2", ...],');
  parts.push('  "keyDifferences": ["Difference 1", "Difference 2", ...],');
  parts.push('  "evolutionSummary": "How opinions evolved throughout the debate",');
  parts.push('  "conclusion": "Your overall conclusion based on the debate",');
  parts.push('  "recommendation": "Your recommendation for the user",');
  parts.push('  "confidence": 0.0 to 1.0');
  parts.push('}');
  parts.push('');
  parts.push('Guidelines:');
  parts.push('- commonGround: List points where ALL agents agreed or showed convergence');
  parts.push('- keyDifferences: List the main points where agents disagreed');
  parts.push('- evolutionSummary: Describe how positions changed across rounds');
  parts.push('- conclusion: Synthesize the key insights from the debate');
  parts.push('- recommendation: Provide actionable advice based on the debate');
  parts.push('- confidence: Your confidence in this synthesis (0-1)');

  return parts.join('\n');
}

/**
 * Parse agent response to extract synthesis result
 * Uses jsonrepair to handle malformed JSON from AI models
 */
function parseSynthesisResponse(responseText: string, synthesizerId: string): SynthesisResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Use jsonrepair to fix common JSON issues (trailing commas, unquoted keys, etc.)
      const repairedJson = jsonrepair(jsonMatch[0]);
      const parsed = JSON.parse(repairedJson) as {
        commonGround?: string[];
        keyDifferences?: string[];
        evolutionSummary?: string;
        conclusion?: string;
        recommendation?: string;
        confidence?: number;
      };

      return {
        commonGround: parsed.commonGround || [],
        keyDifferences: parsed.keyDifferences || [],
        evolutionSummary: parsed.evolutionSummary || 'No evolution summary provided',
        conclusion: parsed.conclusion || 'No conclusion provided',
        recommendation: parsed.recommendation || 'No recommendation provided',
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        synthesizerId,
        timestamp: new Date(),
      };
    }
  } catch (error) {
    // Fall through to fallback parsing
    logger.warn({ err: error }, 'Failed to parse synthesis response as JSON');
  }

  // Fallback: create a basic synthesis from the raw text
  return {
    commonGround: ['See detailed analysis in conclusion'],
    keyDifferences: ['See detailed analysis in conclusion'],
    evolutionSummary: 'Unable to parse structured evolution summary',
    conclusion: responseText,
    recommendation: 'Review the detailed analysis above',
    confidence: 0.5,
    synthesizerId,
    timestamp: new Date(),
  };
}
