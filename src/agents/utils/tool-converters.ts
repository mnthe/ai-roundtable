/**
 * Tool Converters - Utilities for converting toolkit tools to provider-specific formats
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { AgentToolkit } from '../../tools/types.js';

/**
 * Convert toolkit tools to OpenAI-format tool definitions
 *
 * This function converts the generic AgentToolkit tools to the OpenAI API format
 * (ChatCompletionTool). Used by both ChatGPTAgent and PerplexityAgent since
 * Perplexity uses an OpenAI-compatible API.
 *
 * @param toolkit - The agent toolkit containing tool definitions
 * @returns Array of OpenAI-format tool definitions
 */
export function buildOpenAITools(toolkit: AgentToolkit | undefined): ChatCompletionTool[] {
  if (!toolkit) {
    return [];
  }

  return toolkit.getTools().map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        properties: tool.parameters,
        required: Object.keys(tool.parameters),
      },
    },
  }));
}
