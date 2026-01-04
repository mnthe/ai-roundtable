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
  /** Default number of retries for API calls */
  MAX_RETRIES: 3,
  /** Base delay in ms between retry attempts */
  RETRY_BASE_DELAY_MS: 1000,
  /** Maximum wait time in ms before rate limiter throws error */
  RATE_LIMIT_WAIT_THRESHOLD_MS: 60000,
} as const;
