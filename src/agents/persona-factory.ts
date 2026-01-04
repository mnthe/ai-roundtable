/**
 * Persona Factory
 *
 * Creates multiple persona agents from available providers.
 * Uses round-robin distribution when multiple providers are available.
 */

import { randomUUID } from 'crypto';
import type { AgentConfig, AIProvider, DebateMode } from '../types/index.js';
import type { AgentRegistry } from './registry.js';
import { getPersonasForMode, type PersonaTemplate } from './personas/index.js';

/**
 * Options for creating persona agents
 */
export interface PersonaAgentOptions {
  /** Debate mode (determines persona set) */
  mode: DebateMode;
  /** Number of agents to create */
  count: number;
  /** Available providers (in priority order) */
  providers: AIProvider[];
  /** Optional session ID prefix for unique agent IDs (auto-generated if not provided) */
  sessionPrefix?: string;
}

/**
 * Provider display names for agent naming
 */
const PROVIDER_DISPLAY_NAMES: Record<AIProvider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  google: 'Gemini',
  perplexity: 'Perplexity',
};

/**
 * Build system prompt for a persona
 */
function buildPersonaSystemPrompt(persona: PersonaTemplate): string {
  return `You are ${persona.name}, an AI participant with a perspective focused on ${persona.trait}.

Maintain this perspective consistently throughout the debate.
Your role is to provide insights from your unique viewpoint while engaging constructively with others.

Key behaviors:
- Stay true to your ${persona.name} perspective
- Support your positions with evidence and reasoning
- Acknowledge valid points from other perspectives
- Be willing to refine your position based on new information`;
}

/**
 * Create multiple persona agents using round-robin provider distribution
 *
 * @param registry - Agent registry to create agents in
 * @param options - Persona agent creation options
 * @returns Array of created agent IDs
 */
export function createPersonaAgents(
  registry: AgentRegistry,
  options: PersonaAgentOptions
): string[] {
  const { mode, count, providers, sessionPrefix } = options;
  const uniquePrefix = sessionPrefix ?? randomUUID().substring(0, 8);

  if (providers.length === 0) {
    throw new Error('No providers available for creating persona agents');
  }

  // Validate all providers are registered
  for (const provider of providers) {
    if (!registry.hasProvider(provider)) {
      throw new Error(
        `Provider "${provider}" is not registered. ` +
          `Available: ${registry.getRegisteredProviders().join(', ')}`
      );
    }
  }

  // Get personas for the mode
  const personas = getPersonasForMode(mode, count);

  // Create agents with round-robin provider distribution
  const agentIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const provider = providers[i % providers.length];
    const persona = personas[i];

    // Type guards for safety
    if (!provider) {
      throw new Error(`Provider at index ${i} is undefined`);
    }
    if (!persona) {
      throw new Error(`Persona at index ${i} is undefined`);
    }

    const defaultModel = registry.getDefaultModel(provider);
    if (!defaultModel) {
      throw new Error(`No default model for provider "${provider}"`);
    }

    const displayName = PROVIDER_DISPLAY_NAMES[provider];
    if (!displayName) {
      throw new Error(`No display name for provider "${provider}"`);
    }

    const agentId = `${provider}-persona-${uniquePrefix}-${i + 1}`;

    const config: AgentConfig = {
      id: agentId,
      name: `${displayName} (${persona.name})`,
      provider,
      model: defaultModel,
      systemPrompt: buildPersonaSystemPrompt(persona),
    };

    registry.createAgent(config);
    agentIds.push(agentId);
  }

  return agentIds;
}
