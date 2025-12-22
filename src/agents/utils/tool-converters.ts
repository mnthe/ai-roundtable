/**
 * Tool Converters - Utilities for converting toolkit tools to provider-specific formats
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { FunctionTool } from 'openai/resources/responses/responses';
import type { AgentToolkit } from '../../tools/types.js';

/**
 * Convert toolkit tools to OpenAI Chat Completions API format
 *
 * This function converts the generic AgentToolkit tools to the OpenAI Chat API format
 * (ChatCompletionTool). Used by PerplexityAgent which uses an OpenAI-compatible API.
 *
 * @deprecated For ChatGPT, prefer using buildResponsesFunctionTools with the Responses API
 * @param toolkit - The agent toolkit containing tool definitions
 * @returns Array of OpenAI Chat Completions tool definitions
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
