/**
 * Light Agent Selector - Shared utility for selecting and creating light model agents
 *
 * Provides reusable logic for selecting a preferred agent from the registry
 * and creating light model variants for analysis tasks.
 */

import type { BaseAgent } from '../../agents/base.js';
import type { AgentRegistry } from '../../agents/registry.js';
import {
  createLightModelAgent,
  type LightModelAgentOptions,
} from '../../agents/utils/light-model-factory.js';
import type { AIProvider } from '../../types/index.js';

/**
 * Configuration for light agent selection
 */
export interface LightAgentConfig {
  /** Agent registry to get available agents */
  registry: AgentRegistry;
  /** Preferred provider for selection (uses first available if not specified) */
  preferredProvider?: AIProvider;
  /** Suffix to append to the agent ID (e.g., 'consensus', 'keypoints') */
  idSuffix: string;
  /** Optional maximum tokens for the light model agent */
  maxTokens?: number;
}

/**
 * Select a preferred agent from the registry based on provider preference
 *
 * @param registry - The agent registry containing active agents
 * @param preferredProvider - Optional preferred provider to prioritize
 * @returns The selected agent or null if no active agents available
 */
export function selectPreferredAgent(
  registry: AgentRegistry,
  preferredProvider?: AIProvider
): BaseAgent | null {
  const activeAgents = registry.getActiveAgents();
  if (activeAgents.length === 0) return null;

  if (preferredProvider) {
    const preferred = activeAgents.find((a) => a.getInfo().provider === preferredProvider);
    if (preferred) return preferred;
  }

  return activeAgents[0] ?? null;
}

/**
 * Create a light model agent from a base agent
 *
 * Wrapper around createLightModelAgent for consistent interface.
 *
 * @param baseAgent - The base agent to create a light variant from
 * @param registry - The agent registry containing provider factories
 * @param options - Configuration options for the light model agent
 * @returns A new agent instance using the light model
 */
export function createLightAgentFromBase(
  baseAgent: BaseAgent,
  registry: AgentRegistry,
  options: Omit<LightModelAgentOptions, 'registry'>
): BaseAgent {
  return createLightModelAgent(baseAgent, registry, options);
}
