/**
 * Agents module - AI agent abstraction layer
 */

export { BaseAgent, MockAgent, type AgentTool, type AgentToolkit } from './base.js';
export {
  AgentRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
  type AgentFactory,
} from './registry.js';
export { ClaudeAgent, createClaudeAgent, type ClaudeAgentOptions } from './claude.js';
export { ChatGPTAgent, createChatGPTAgent, type ChatGPTAgentOptions } from './chatgpt.js';
export { GeminiAgent, createGeminiAgent, type GeminiAgentOptions } from './gemini.js';
export {
  PerplexityAgent,
  createPerplexityAgent,
  type PerplexityAgentOptions,
  type PerplexitySearchOptions,
  type SearchRecencyFilter,
} from './perplexity.js';
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
