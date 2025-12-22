/**
 * OpenAI Agent Utilities
 */

import type { FunctionTool } from 'openai/resources/responses/responses';
import type { AgentToolkit } from '../../tools/types.js';

/**
 * Convert toolkit tools to OpenAI Responses API FunctionTool format
 *
 * This function converts the generic AgentToolkit tools to the Responses API format
 * (FunctionTool). Used by ChatGPTAgent with the Responses API.
 *
 * @param toolkit - The agent toolkit containing tool definitions
 * @returns Array of Responses API FunctionTool definitions
 */
export function buildResponsesFunctionTools(toolkit: AgentToolkit | undefined): FunctionTool[] {
  if (!toolkit) {
    return [];
  }

  return toolkit.getTools().map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object' as const,
      properties: tool.parameters,
      required: Object.keys(tool.parameters),
    },
    strict: false,
  }));
}
