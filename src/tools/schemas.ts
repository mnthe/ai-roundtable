/**
 * Zod schemas for toolkit tool input validation
 *
 * These schemas provide runtime type checking for tool inputs,
 * ensuring that executeTool() receives properly typed data.
 */

import { z } from 'zod';

// ============================================
// Tool Input Schemas
// ============================================

/**
 * Schema for fact_check tool input
 */
export const FactCheckInputSchema = z.object({
  claim: z.string().min(1, 'Claim is required and must be a non-empty string'),
  source_agent: z.string().optional().default('unknown'),
});

/**
 * Schema for request_context tool input
 *
 * Agents use this to request additional information from the caller.
 * The query should be natural language describing WHAT is needed,
 * not HOW to get it (the caller decides that).
 */
export const RequestContextInputSchema = z.object({
  query: z
    .string()
    .min(1, 'Query is required')
    .max(1000, 'Query cannot exceed 1000 characters')
    .describe('Natural language description of what information is needed'),
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason cannot exceed 500 characters')
    .describe('Why this information is needed for the debate'),
  priority: z
    .enum(['required', 'optional'], {
      error: 'priority must be one of: required, optional',
    })
    .default('required')
    .describe('Whether this information is required to continue'),
});

// ============================================
// Inferred Types
// ============================================

export type FactCheckInput = z.infer<typeof FactCheckInputSchema>;
export type RequestContextInput = z.infer<typeof RequestContextInputSchema>;

// ============================================
// Schema Registry
// ============================================

/**
 * Map of tool names to their input schemas
 * Used by executeTool() for input validation
 */
export const TOOL_INPUT_SCHEMAS: Record<string, z.ZodSchema> = {
  fact_check: FactCheckInputSchema,
  request_context: RequestContextInputSchema,
};

/**
 * Validate tool input against its schema
 *
 * @param toolName - Name of the tool
 * @param input - Raw input to validate
 * @returns Validated and parsed input, or null with error message
 */
export function validateToolInput(
  toolName: string,
  input: unknown
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = TOOL_INPUT_SCHEMAS[toolName];

  if (!schema) {
    // No schema defined for this tool (e.g., custom tools)
    return { success: true, data: input };
  }

  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format Zod error into readable message
  const errorMessages = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  return {
    success: false,
    error: errorMessages.join('; '),
  };
}
