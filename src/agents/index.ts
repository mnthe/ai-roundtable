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
export { GPT4Agent, createGPT4Agent, type GPT4AgentOptions } from './gpt4.js';
