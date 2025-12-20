/**
 * Light Model Factory - Creates lightweight model variants for analysis tasks
 *
 * This utility creates new agent instances using lightweight models for cost-efficient
 * analysis operations like consensus analysis and key points extraction.
 */

import type { BaseAgent } from '../base.js';
import type { AgentRegistry } from '../registry.js';
import { LIGHT_MODELS } from '../setup.js';

/**
 * Options for creating a light model agent
 */
export interface LightModelAgentOptions {
  /** Suffix to append to the agent ID (e.g., 'consensus', 'keypoints') */
  idSuffix: string;
  /** Optional maximum tokens for the light model agent */
  maxTokens?: number;
}

/**
 * Create a variant of an agent using the lightweight model for its provider
 *
 * Creates a new agent instance with the same provider but using the lightweight model
 * defined in LIGHT_MODELS for cost-efficient analysis tasks.
 *
 * @param baseAgent - The base agent to create a light variant from
 * @param registry - The agent registry containing provider factories
 * @param options - Configuration options for the light model agent
 * @returns A new agent instance using the light model, or the base agent if factory unavailable
 *
 * @example
 * ```typescript
 * const lightAgent = createLightModelAgent(baseAgent, registry, {
 *   idSuffix: 'consensus',
 *   maxTokens: 8192,
 * });
 * ```
 */
export function createLightModelAgent(
  baseAgent: BaseAgent,
  registry: AgentRegistry,
  options: LightModelAgentOptions
): BaseAgent {
  const info = baseAgent.getInfo();
  const lightModel = LIGHT_MODELS[info.provider];

  // Get the factory from registry to create a new agent with light model
  const factory = registry.getProviderFactory(info.provider);
  if (!factory) {
    // Fallback to base agent if factory not available
    return baseAgent;
  }

  // Create new agent with light model config
  const lightConfig = {
    id: `${info.id}-light-${options.idSuffix}`,
    name: `${info.name} (Light)`,
    provider: info.provider,
    model: lightModel,
    ...(options.maxTokens && { maxTokens: options.maxTokens }),
  };

  return factory(lightConfig);
}
