/**
 * Agent Setup - Initialize agents based on available API keys
 *
 * This module automatically detects available API keys and registers
 * the corresponding AI providers and default agents.
 */

import { AgentRegistry } from './registry.js';
import { ClaudeAgent } from './claude.js';
import { ChatGPTAgent } from './chatgpt.js';
import { GeminiAgent } from './gemini.js';
import { PerplexityAgent } from './perplexity.js';
import type { AIProvider, AgentConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AgentSetup');

/**
 * API key configuration for each provider
 */
export interface ApiKeyConfig {
  anthropic?: string;
  openai?: string;
  google?: string;
  perplexity?: string;
}

/**
 * Provider availability result
 */
export interface ProviderAvailability {
  provider: AIProvider;
  available: boolean;
  reason?: string;
}

/**
 * Setup result containing registered providers and agents
 */
export interface SetupResult {
  providers: ProviderAvailability[];
  agents: AgentConfig[];
  warnings: string[];
}

/**
 * Default models for each provider (heavy models for debate)
 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-5.2',
  google: 'gemini-3-flash-preview',
  perplexity: 'sonar-pro',
};

/**
 * Light models for each provider (for analysis tasks - faster & cheaper)
 */
export const LIGHT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
  google: 'gemini-2.5-flash-lite',
  perplexity: 'sonar',
};

/**
 * Default agent names
 */
const DEFAULT_AGENT_NAMES: Record<AIProvider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  google: 'Gemini',
  perplexity: 'Perplexity',
};

/**
 * Check which API keys are available from environment
 */
export function detectApiKeys(): ApiKeyConfig {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    perplexity: process.env.PERPLEXITY_API_KEY,
  };
}

/**
 * Check provider availability based on API keys
 */
export function checkProviderAvailability(apiKeys: ApiKeyConfig): ProviderAvailability[] {
  return [
    {
      provider: 'anthropic',
      available: !!apiKeys.anthropic,
      reason: apiKeys.anthropic ? undefined : 'ANTHROPIC_API_KEY not set',
    },
    {
      provider: 'openai',
      available: !!apiKeys.openai,
      reason: apiKeys.openai ? undefined : 'OPENAI_API_KEY not set',
    },
    {
      provider: 'google',
      available: !!apiKeys.google,
      reason: apiKeys.google ? undefined : 'GOOGLE_API_KEY not set',
    },
    {
      provider: 'perplexity',
      available: !!apiKeys.perplexity,
      reason: apiKeys.perplexity ? undefined : 'PERPLEXITY_API_KEY not set',
    },
  ];
}

/**
 * Setup registry with available providers
 *
 * @param registry - Agent registry to configure
 * @param apiKeys - Optional API key configuration (defaults to env vars)
 * @returns Setup result with providers and agents info
 */
export function setupProviders(registry: AgentRegistry, apiKeys?: ApiKeyConfig): SetupResult {
  const keys = apiKeys ?? detectApiKeys();
  const availability = checkProviderAvailability(keys);
  const warnings: string[] = [];
  const registeredAgents: AgentConfig[] = [];

  // Register Anthropic/Claude
  if (keys.anthropic) {
    registry.registerProvider(
      'anthropic',
      (config) => new ClaudeAgent(config, { apiKey: keys.anthropic }),
      DEFAULT_MODELS.anthropic
    );
  } else {
    warnings.push('Claude agent not available: ANTHROPIC_API_KEY not set');
  }

  // Register OpenAI/ChatGPT
  if (keys.openai) {
    registry.registerProvider(
      'openai',
      (config) => new ChatGPTAgent(config, { apiKey: keys.openai }),
      DEFAULT_MODELS.openai
    );
  } else {
    warnings.push('ChatGPT agent not available: OPENAI_API_KEY not set');
  }

  // Register Google/Gemini
  if (keys.google) {
    registry.registerProvider(
      'google',
      (config) => new GeminiAgent(config, { apiKey: keys.google }),
      DEFAULT_MODELS.google
    );
  } else {
    warnings.push('Gemini agent not available: GOOGLE_API_KEY not set');
  }

  // Register Perplexity
  if (keys.perplexity) {
    registry.registerProvider(
      'perplexity',
      (config) => new PerplexityAgent(config, { apiKey: keys.perplexity }),
      DEFAULT_MODELS.perplexity
    );
  } else {
    warnings.push('Perplexity agent not available: PERPLEXITY_API_KEY not set');
  }

  return {
    providers: availability,
    agents: registeredAgents,
    warnings,
  };
}

/**
 * Create default agents for all available providers
 *
 * @param registry - Agent registry with providers already set up
 * @returns List of created agent configs
 */
export function createDefaultAgents(registry: AgentRegistry): AgentConfig[] {
  const agents: AgentConfig[] = [];
  const providers = registry.getRegisteredProviders();

  for (const provider of providers) {
    const defaultModel = registry.getDefaultModel(provider);
    if (!defaultModel) continue;

    const config: AgentConfig = {
      id: `${provider}-default`,
      name: DEFAULT_AGENT_NAMES[provider] || provider,
      provider,
      model: defaultModel,
    };

    try {
      registry.createAgent(config);
      agents.push(config);
    } catch (error) {
      // Agent might already exist, skip
      logger.warn({ err: error, provider }, 'Could not create default agent');
    }
  }

  return agents;
}

/**
 * Run health checks on all agents in the registry
 *
 * Uses parallel execution for better performance when multiple agents are registered.
 *
 * @param registry - Agent registry to check
 * @returns Array of health check results
 */
export async function runHealthChecks(
  registry: AgentRegistry
): Promise<Array<{ id: string; name: string; healthy: boolean; error?: string }>> {
  const agents = registry.getAllAgents();

  // Run all health checks in parallel for better performance
  const results = await Promise.all(
    agents.map(async (agent) => {
      const info = agent.getInfo();
      const result = await agent.healthCheck();

      // Update registry status based on health check
      if (!result.healthy) {
        registry.deactivateAgent(info.id, result.error);
        logger.warn(
          { agentId: info.id, agentName: info.name, provider: info.provider, error: result.error },
          'Agent health check failed'
        );
      }

      return {
        id: info.id,
        name: info.name,
        healthy: result.healthy,
        error: result.error,
      };
    })
  );

  return results;
}

/**
 * Full setup: register providers and create default agents
 *
 * @param registry - Agent registry to configure
 * @param apiKeys - Optional API key configuration
 * @param options - Setup options
 * @returns Complete setup result
 */
export async function setupAgents(
  registry: AgentRegistry,
  apiKeys?: ApiKeyConfig,
  options?: { runHealthCheck?: boolean }
): Promise<SetupResult> {
  // First, setup providers
  const result = setupProviders(registry, apiKeys);

  // Then, create default agents
  const agents = createDefaultAgents(registry);
  result.agents = agents;

  // Check if any agents were created
  if (agents.length === 0) {
    result.warnings.push(
      'No agents available. Please set at least one API key: ' +
        'ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or PERPLEXITY_API_KEY'
    );
    return result;
  }

  // Run health checks if requested (default: true)
  if (options?.runHealthCheck !== false) {
    const healthResults = await runHealthChecks(registry);

    // Add warnings for failed health checks
    const failedAgents = healthResults.filter((r) => !r.healthy);
    for (const failed of failedAgents) {
      result.warnings.push(
        `Agent "${failed.name}" health check failed and has been deactivated: ${failed.error}`
      );
    }

    // Check if any agents are healthy
    const healthyAgents = healthResults.filter((r) => r.healthy);
    if (healthyAgents.length === 0) {
      result.warnings.push(
        'All agents failed health checks. Please verify API keys and network connectivity.'
      );
    }
  }

  return result;
}

/**
 * Get a summary of available agents
 */
export function getAvailabilityReport(result: SetupResult): string {
  const lines: string[] = ['AI Roundtable - Agent Availability Report', ''];

  lines.push('Providers:');
  for (const provider of result.providers) {
    const status = provider.available ? '✓' : '✗';
    const reason = provider.reason ? ` (${provider.reason})` : '';
    lines.push(`  ${status} ${provider.provider}${reason}`);
  }

  lines.push('');
  lines.push('Registered Agents:');
  if (result.agents.length > 0) {
    for (const agent of result.agents) {
      lines.push(`  - ${agent.name} (${agent.provider}/${agent.model})`);
    }
  } else {
    lines.push('  No agents registered');
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ! ${warning}`);
    }
  }

  return lines.join('\n');
}
