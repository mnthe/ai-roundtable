/**
 * Anthropic Agent Utilities
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { AgentToolkit } from '../../tools/types.js';

/**
 * Convert toolkit tools to Anthropic API format
 *
 * @param toolkit - The agent toolkit containing tool definitions
 * @returns Array of Anthropic Tool definitions
 */
export function buildAnthropicTools(toolkit: AgentToolkit | undefined): Tool[] {
  if (!toolkit) {
    return [];
  }

  return toolkit.getTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.parameters,
      required: Object.keys(tool.parameters),
    },
  }));
}
