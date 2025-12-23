/**
 * Default configuration values for AI agents
 */
export const AGENT_DEFAULTS = {
  /** Default temperature for agent responses */
  TEMPERATURE: 0.7,
  /** Default maximum tokens for agent responses */
  MAX_TOKENS: 4096,
  /** Maximum iterations for tool call loops to prevent infinite loops */
  MAX_TOOL_ITERATIONS: 10,
} as const;
