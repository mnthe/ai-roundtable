/**
 * Perplexity Agent Utilities
 */

import type { CompletionCreateParams } from '@perplexity-ai/perplexity_ai/resources/chat/completions';
import type { AgentToolkit } from '../../tools/types.js';

/**
 * Convert toolkit tools to Perplexity API format
 *
 * Perplexity uses an OpenAI-compatible Chat Completions API with function calling support.
 *
 * @param toolkit - The agent toolkit containing tool definitions
 * @returns Array of Perplexity tool definitions
 */
export function buildPerplexityTools(
  toolkit: AgentToolkit | undefined
): CompletionCreateParams.Tool[] {
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
