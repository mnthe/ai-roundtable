/**
 * Response mapping utilities for MCP output
 */

import type { AgentResponse } from '../../../types/index.js';

/**
 * Mapped response for MCP output (excludes internal fields)
 */
export interface MappedResponse {
  position: string;
  reasoning: string;
  confidence: number;
  stance?: 'YES' | 'NO' | 'NEUTRAL';
  citations?: AgentResponse['citations'];
  toolCalls?: { toolName: string; timestamp: Date }[];
  timestamp: Date;
}

/**
 * Mapped response with agent identifiers
 */
export interface MappedResponseWithAgent extends MappedResponse {
  agentId: string;
  agentName: string;
}

/**
 * Map agent response for MCP output (without agent identifiers)
 * Strips internal fields and formats tool calls
 */
export function mapResponseForOutput(response: AgentResponse): MappedResponse {
  return {
    position: response.position,
    reasoning: response.reasoning,
    confidence: response.confidence,
    stance: response.stance,
    citations: response.citations,
    toolCalls: response.toolCalls?.map((tc) => ({
      toolName: tc.toolName,
      timestamp: tc.timestamp,
    })),
    timestamp: response.timestamp,
  };
}

/**
 * Map agent response for MCP output (with agent identifiers)
 * Used when agent context is needed in the output
 */
export function mapResponseWithAgentForOutput(response: AgentResponse): MappedResponseWithAgent {
  return {
    agentId: response.agentId,
    agentName: response.agentName,
    ...mapResponseForOutput(response),
  };
}
