/**
 * Agent Registry - Manages available AI agents
 */

import type { AgentConfig, AIProvider } from '../types/index.js';
import { BaseAgent, AgentToolkit } from './base.js';

/**
 * Factory function type for creating agents
 */
export type AgentFactory = (config: AgentConfig, toolkit?: AgentToolkit) => BaseAgent;

/**
 * Registry entry for an agent provider
 */
interface ProviderRegistration {
  provider: AIProvider;
  factory: AgentFactory;
  defaultModel: string;
}

/**
 * Agent status tracking
 */
interface AgentStatus {
  agent: BaseAgent;
  active: boolean;
  healthCheckError?: string;
}

/**
 * Agent Registry
 *
 * Manages the registration and creation of AI agents.
 * Use this to:
 * - Register new agent types (providers)
 * - Create agent instances
 * - List available agents
 * - Track agent health status
 */
export class AgentRegistry {
  private providers: Map<AIProvider, ProviderRegistration> = new Map();
  private agents: Map<string, AgentStatus> = new Map();
  private toolkit?: AgentToolkit;

  /**
   * Set the toolkit that will be provided to all agents
   */
  setToolkit(toolkit: AgentToolkit): void {
    this.toolkit = toolkit;
    // Update existing agents with the new toolkit
    for (const status of this.agents.values()) {
      status.agent.setToolkit(toolkit);
    }
  }

  /**
   * Register a new agent provider
   *
   * @example
   * registry.registerProvider('anthropic', (config) => new ClaudeAgent(config), 'claude-3-opus');
   */
  registerProvider(
    provider: AIProvider,
    factory: AgentFactory,
    defaultModel: string
  ): void {
    this.providers.set(provider, { provider, factory, defaultModel });
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(provider: AIProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Get list of registered providers
   */
  getRegisteredProviders(): AIProvider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create and register an agent instance
   *
   * @example
   * const agent = registry.createAgent({
   *   id: 'claude-1',
   *   name: 'Claude',
   *   provider: 'anthropic',
   *   model: 'claude-3-opus-20240229'
   * });
   */
  createAgent(config: AgentConfig): BaseAgent {
    const registration = this.providers.get(config.provider);
    if (!registration) {
      throw new Error(
        `Provider "${config.provider}" is not registered. ` +
          `Available providers: ${this.getRegisteredProviders().join(', ')}`
      );
    }

    if (this.agents.has(config.id)) {
      throw new Error(`Agent with ID "${config.id}" already exists`);
    }

    const agent = registration.factory(config, this.toolkit);
    if (this.toolkit) {
      agent.setToolkit(this.toolkit);
    }
    this.agents.set(config.id, {
      agent,
      active: true, // Assume active until health check proves otherwise
    });
    return agent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id)?.agent;
  }

  /**
   * Get an agent by ID, throwing if not found
   */
  getAgentOrThrow(id: string): BaseAgent {
    const status = this.agents.get(id);
    if (!status) {
      throw new Error(`Agent "${id}" not found`);
    }
    return status.agent;
  }

  /**
   * Get multiple agents by IDs
   */
  getAgents(ids: string[]): BaseAgent[] {
    return ids.map((id) => this.getAgentOrThrow(id));
  }

  /**
   * Check if an agent exists
   */
  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * Check if an agent is active (healthy)
   */
  isAgentActive(id: string): boolean {
    return this.agents.get(id)?.active ?? false;
  }

  /**
   * Mark an agent as inactive
   */
  deactivateAgent(id: string, error?: string): void {
    const status = this.agents.get(id);
    if (status) {
      status.active = false;
      status.healthCheckError = error;
    }
  }

  /**
   * Mark an agent as active
   */
  activateAgent(id: string): void {
    const status = this.agents.get(id);
    if (status) {
      status.active = true;
      status.healthCheckError = undefined;
    }
  }

  /**
   * Remove an agent
   */
  removeAgent(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * Get all registered agent IDs
   */
  getAllAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get all active agent IDs
   */
  getActiveAgentIds(): string[] {
    return Array.from(this.agents.entries())
      .filter(([, status]) => status.active)
      .map(([id]) => id);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values()).map((status) => status.agent);
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): BaseAgent[] {
    return Array.from(this.agents.values())
      .filter((status) => status.active)
      .map((status) => status.agent);
  }

  /**
   * Get agent info for all registered agents
   */
  getAgentInfoList(): Array<{
    id: string;
    name: string;
    provider: AIProvider;
    model: string;
  }> {
    return this.getAllAgents().map((agent) => agent.getInfo());
  }

  /**
   * Get agent info for all active agents only
   */
  getActiveAgentInfoList(): Array<{
    id: string;
    name: string;
    provider: AIProvider;
    model: string;
    active: boolean;
  }> {
    return Array.from(this.agents.values())
      .filter((status) => status.active)
      .map((status) => ({
        ...status.agent.getInfo(),
        active: true,
      }));
  }

  /**
   * Get health status for all agents
   */
  getAgentHealthStatus(): Array<{
    id: string;
    name: string;
    provider: AIProvider;
    model: string;
    active: boolean;
    error?: string;
  }> {
    return Array.from(this.agents.entries()).map(([, status]) => ({
      ...status.agent.getInfo(),
      active: status.active,
      error: status.healthCheckError,
    }));
  }

  /**
   * Clear all agents (useful for testing)
   */
  clearAgents(): void {
    this.agents.clear();
  }

  /**
   * Clear all providers (useful for testing)
   */
  clearProviders(): void {
    this.providers.clear();
  }

  /**
   * Clear everything (useful for testing)
   */
  clear(): void {
    this.clearAgents();
    this.clearProviders();
  }

  /**
   * Get default model for a provider
   */
  getDefaultModel(provider: AIProvider): string | undefined {
    return this.providers.get(provider)?.defaultModel;
  }
}

/**
 * Global singleton registry instance
 */
let globalRegistry: AgentRegistry | null = null;

/**
 * Get the global agent registry instance
 */
export function getGlobalRegistry(): AgentRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (for testing)
 */
export function resetGlobalRegistry(): void {
  if (globalRegistry) {
    globalRegistry.clear();
  }
  globalRegistry = null;
}
