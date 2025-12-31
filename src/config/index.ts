/**
 * Configuration Module
 *
 * Centralized configuration exports for AI Roundtable.
 * All environment variable-based settings should be accessed through this module.
 */

// Provider configuration (API keys, models)
export {
  type ApiKeyConfig,
  type ProviderAvailability,
  DEFAULT_MODELS,
  LIGHT_MODELS,
  DEFAULT_AGENT_NAMES,
  detectApiKeys,
  checkProviderAvailability,
} from './providers.js';

// Exit criteria configuration
export {
  type ExitCriteriaConfig,
  ExitCriteriaConfigSchema,
  EXIT_CRITERIA_CONFIG,
} from './exit-criteria.js';

// Agent default configuration
export { AGENT_DEFAULTS } from './agent-defaults.js';

// Agent limits configuration
export {
  type AgentLimitsConfig,
  DEFAULT_MAX_AGENTS,
  DEFAULT_AGENT_COUNT,
  loadAgentLimitsConfig,
} from './agent-limits.js';
