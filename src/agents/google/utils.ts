/**
 * Gemini Agent Utilities
 */

import { Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';
import type { AgentToolkit } from '../../tools/types.js';

/**
 * Convert toolkit tools to Gemini API format
 *
 * Uses the @google/genai SDK format with parametersJsonSchema.
 *
 * @param toolkit - The agent toolkit containing tool definitions
 * @returns Array of Gemini FunctionDeclaration definitions
 */
export function buildGeminiTools(toolkit: AgentToolkit | undefined): FunctionDeclaration[] {
  if (!toolkit) {
    return [];
  }

  return toolkit.getTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([key, value]) => [
          key,
          {
            type: Type.STRING,
            description: (value as { description?: string }).description ?? '',
          },
        ])
      ),
      required: Object.keys(tool.parameters),
    },
  }));
}
