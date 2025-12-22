/**
 * Anthropic (Claude) Agent Types
 */

/**
 * Web search configuration options
 */
export interface WebSearchConfig {
  /** Enable native web search (default: true) */
  enabled?: boolean;
  /** Only include results from these domains */
  allowedDomains?: string[];
  /** Exclude results from these domains */
  blockedDomains?: string[];
  /** Maximum number of web searches per request (default: 5) */
  maxUses?: number;
}

/**
 * Configuration options for Claude Agent
 */
export interface ClaudeAgentOptions {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Custom Anthropic client instance (for testing) */
  client?: import('@anthropic-ai/sdk').default;
  /** Web search configuration (default: enabled) */
  webSearch?: WebSearchConfig;
}
