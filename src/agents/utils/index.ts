/**
 * Agent Utilities - Shared utilities for AI agents
 *
 * Note: Provider-specific tool converters are in their respective folders:
 * - Anthropic: agents/anthropic/utils.ts (buildAnthropicTools)
 * - Google: agents/google/utils.ts (buildGeminiTools)
 * - OpenAI: agents/openai/utils.ts (buildResponsesFunctionTools)
 * - Perplexity: agents/perplexity/utils.ts (buildPerplexityTools)
 */

export { convertSDKError, isRetryableError } from './error-converter.js';
export { createLightModelAgent, type LightModelAgentOptions } from './light-model-factory.js';
export {
  selectPreferredAgent,
  createLightAgentFromBase,
  type LightAgentConfig,
} from './light-agent-selector.js';
export {
  getCachedHealthStatus,
  setCachedHealthStatus,
  clearHealthCache,
  getHealthCacheSize,
  DEFAULT_HEALTH_CACHE_TTL_MS,
} from './health-cache.js';
