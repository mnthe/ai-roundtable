/**
 * Agents module - AI agent abstraction layer
 */

export { BaseAgent, MockAgent, type AgentTool, type AgentToolkit } from './base.js';
export type { BaseAgentOptions } from './types/index.js';
export {
  AgentRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
  type AgentFactory,
} from './registry.js';

// Provider-specific agents (organized by provider directory)
export {
  ClaudeAgent,
  createClaudeAgent,
  type ClaudeAgentOptions,
  type WebSearchConfig,
} from './anthropic/index.js';
export {
  ChatGPTAgent,
  createChatGPTAgent,
  type ChatGPTAgentOptions,
  type ChatGPTWebSearchConfig,
} from './openai/index.js';
export {
  GeminiAgent,
  createGeminiAgent,
  type GeminiAgentOptions,
  type GoogleSearchConfig,
} from './google/index.js';
export {
  PerplexityAgent,
  createPerplexityAgent,
  type PerplexityAgentOptions,
  type PerplexitySearchOptions,
  type SearchRecencyFilter,
} from './perplexity/index.js';

// Setup and utilities
export {
  setupAgents,
  setupProviders,
  createDefaultAgents,
  detectApiKeys,
  checkProviderAvailability,
  getAvailabilityReport,
  type ApiKeyConfig,
  type ProviderAvailability,
  type SetupResult,
} from './setup.js';
export {
  convertSDKError,
  isRetryableError,
  createLightModelAgent,
  type LightModelAgentOptions,
} from './utils/index.js';

// Persona system
export { createPersonaAgents, type PersonaAgentOptions } from './persona-factory.js';
export { getPersonasForMode, type PersonaTemplate } from './personas/index.js';
