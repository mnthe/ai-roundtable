/**
 * Agent query handlers
 * Handles: get_agents
 */

import type { AgentRegistry } from '../../agents/registry.js';
import { GetAgentsInputSchema } from '../../types/schemas.js';
import { createSuccessResponse, createErrorResponse, type ToolResponse } from '../tools.js';
import { wrapError } from './utils/index.js';

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
    return createErrorResponse(wrapError(error));
  }
}

// --- Handler Registration ---

import type { HandlerRegistry } from '../handler-registry.js';

/**
 * Register agent handlers with the registry
 */
export function registerAgentHandlers(registry: HandlerRegistry): void {
  registry.register('get_agents', (args, ctx) => handleGetAgents(args, ctx.agentRegistry));
}
