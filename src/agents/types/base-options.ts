/**
 * Base options interface for all AI agents
 * Provider-specific options should extend this interface
 */
export interface BaseAgentOptions<TClient = unknown> {
  /** API key for authentication (overrides environment variable) */
  apiKey?: string;
  /** Pre-configured client instance (for testing or custom configuration) */
  client?: TClient;
}
