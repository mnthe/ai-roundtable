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
 * Schema for get_context tool input (no parameters required)
 */
export const GetContextInputSchema = z.object({}).strict();

/**
 * Schema for submit_response tool input
 */
export const SubmitResponseInputSchema = z.object({
  stance: z
    .enum(['YES', 'NO', 'NEUTRAL'], {
      error: 'stance must be one of: YES, NO, NEUTRAL',
    })
    .optional(),
  position: z.string().min(1, 'Position is required and must be a non-empty string'),
  reasoning: z.string().min(1, 'Reasoning is required and must be a non-empty string'),
  confidence: z
    .number()
    .min(0, 'Confidence must be between 0 and 1')
    .max(1, 'Confidence must be between 0 and 1')
    .optional()
    .default(0.5),
});

/**
 * Schema for search_web tool input
 */
export const SearchWebInputSchema = z.object({
  query: z.string().min(1, 'Query is required and must be a non-empty string'),
  max_results: z
    .number()
    .int('max_results must be an integer')
    .positive('max_results must be positive')
    .max(10, 'max_results cannot exceed 10')
    .optional()
    .default(5),
});

/**
 * Schema for fact_check tool input
 */
export const FactCheckInputSchema = z.object({
  claim: z.string().min(1, 'Claim is required and must be a non-empty string'),
  source_agent: z.string().optional().default('unknown'),
});

/**
 * Schema for perplexity_search tool input
 */
export const PerplexitySearchInputSchema = z.object({
  query: z.string().min(1, 'Query is required and must be a non-empty string'),
  recency_filter: z
    .enum(['hour', 'day', 'week', 'month'], {
      error: 'recency_filter must be one of: hour, day, week, month',
    })
    .optional(),
  domain_filter: z
    .array(z.string().min(1, 'Domain must be a non-empty string'))
    .max(3, 'domain_filter cannot exceed 3 domains')
    .optional(),
  return_images: z.boolean().optional(),
  return_related_questions: z.boolean().optional(),
});

// ============================================
// Inferred Types
// ============================================

export type GetContextInput = z.infer<typeof GetContextInputSchema>;
export type SubmitResponseInput = z.infer<typeof SubmitResponseInputSchema>;
export type SearchWebInput = z.infer<typeof SearchWebInputSchema>;
export type FactCheckInput = z.infer<typeof FactCheckInputSchema>;
export type PerplexitySearchInput = z.infer<typeof PerplexitySearchInputSchema>;

// ============================================
// Schema Registry
// ============================================

/**
 * Map of tool names to their input schemas
 * Used by executeTool() for input validation
 */
export const TOOL_INPUT_SCHEMAS: Record<string, z.ZodSchema> = {
  get_context: GetContextInputSchema,
  submit_response: SubmitResponseInputSchema,
  search_web: SearchWebInputSchema,
  fact_check: FactCheckInputSchema,
  perplexity_search: PerplexitySearchInputSchema,
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
