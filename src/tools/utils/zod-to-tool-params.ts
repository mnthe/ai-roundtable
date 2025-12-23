/**
 * Utility for converting Zod schemas to tool parameter format
 *
 * This eliminates duplication between Zod schemas (for validation)
 * and JSON schemas (for tool definitions).
 */

import { z } from 'zod';

/**
 * Convert a Zod schema to tool parameter format
 *
 * Extracts the properties object from JSON Schema for use in agent tools.
 * Uses Zod 4's built-in z.toJSONSchema() method.
 *
 * @param schema - Zod schema to convert
 * @returns Properties object suitable for AgentTool.parameters
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   query: z.string().describe('Search query'),
 *   limit: z.number().optional().default(5),
 * });
 *
 * zodToToolParameters(schema);
 * // => {
 * //   query: { type: 'string', description: 'Search query' },
 * //   limit: { type: 'number', default: 5 },
 * // }
 * ```
 */
export function zodToToolParameters(schema: z.ZodType): Record<string, unknown> {
  // Use Zod 4's built-in JSON Schema conversion
  const jsonSchema = z.toJSONSchema(schema, {
    // Use draft-07 for better compatibility with most AI providers
    target: 'draft-07',
    // Convert unrepresentable types to {} instead of throwing
    unrepresentable: 'any',
  }) as Record<string, unknown>;

  // Extract properties object for tool parameter format
  const properties = (jsonSchema as { properties?: Record<string, unknown> }).properties;

  return properties ?? {};
}
