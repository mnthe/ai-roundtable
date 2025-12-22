/**
 * Agent query handlers
 * Handles: get_agents
 */

import type { AgentRegistry } from '../../agents/registry.js';
import { GetAgentsInputSchema } from '../../types/schemas.js';
import { createSuccessResponse, createErrorResponse, type ToolResponse } from '../tools.js';

/**
 * Handler: get_agents
 */
export async function handleGetAgents(
  args: unknown,
  agentRegistry: AgentRegistry
): Promise<ToolResponse> {
  try {
    // Validate input (empty schema for consistency)
    GetAgentsInputSchema.parse(args);

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
