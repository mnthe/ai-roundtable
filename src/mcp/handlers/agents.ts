/**
 * Agent query handlers
 * Handles: get_agents
 */

import type { AgentRegistry } from '../../agents/registry.js';
import { createSuccessResponse, createErrorResponse, type ToolResponse } from '../tools.js';

/**
 * Handler: get_agents
 */
export async function handleGetAgents(agentRegistry: AgentRegistry): Promise<ToolResponse> {
  try {
    // Return only active agents
    const agents = agentRegistry.getActiveAgentInfoList();

    return createSuccessResponse({
      agents,
      count: agents.length,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}
