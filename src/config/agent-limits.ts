/**
 * Agent Limits Configuration
 *
 * Controls the number of persona agents that can be created per debate.
 */

/**
 * Default maximum number of agents allowed per debate
 */
export const DEFAULT_MAX_AGENTS = 5;

/**
 * Default number of agents when not specified in request
 */
export const DEFAULT_AGENT_COUNT = 4;

/**
 * Configuration interface for agent limits
 */
export interface AgentLimitsConfig {
  /** Maximum allowed agents per debate (hard limit) */
  maxAgents: number;
  /** Default agent count when not specified */
  defaultCount: number;
}

/**
 * Load agent limits configuration from environment variables
 *
 * Environment variables:
 * - ROUNDTABLE_MAX_AGENTS: Maximum agents per debate (default: 5)
 * - ROUNDTABLE_DEFAULT_AGENT_COUNT: Default count (default: 4)
 */
export function loadAgentLimitsConfig(): AgentLimitsConfig {
  const maxAgents = parseIntOrDefault(process.env.ROUNDTABLE_MAX_AGENTS, DEFAULT_MAX_AGENTS);

  const rawDefaultCount = parseIntOrDefault(
    process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT,
    DEFAULT_AGENT_COUNT
  );

  // Cap defaultCount at maxAgents
  const defaultCount = Math.min(rawDefaultCount, maxAgents);

  return { maxAgents, defaultCount };
}

/**
 * Parse integer from string with fallback to default
 */
function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
