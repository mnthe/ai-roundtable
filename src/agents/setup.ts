/**
 * Agent Setup - Initialize agents based on available API keys
 *
 * This module automatically detects available API keys and registers
 * the corresponding AI providers and default agents.
 */

import { AgentRegistry } from './registry.js';
import { ClaudeAgent } from './claude.js';
import { GPT4Agent } from './gpt4.js';
import { GeminiAgent } from './gemini.js';
import { PerplexityAgent } from './perplexity.js';
import type { AIProvider, AgentConfig } from '../types/index.js';

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
 * Default models for each provider
 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-5.2',
  google: 'gemini-2.5-flash',
  perplexity: 'sonar-pro',
};

/**
 * Default agent names
 */
const DEFAULT_AGENT_NAMES: Record<AIProvider, string> = {
  anthropic: 'Claude',
  openai: 'GPT-4',
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
    google: process.env.GOOGLE_AI_API_KEY,
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
      reason: apiKeys.google ? undefined : 'GOOGLE_AI_API_KEY not set',
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
export function setupProviders(
  registry: AgentRegistry,
  apiKeys?: ApiKeyConfig
): SetupResult {
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

  // Register OpenAI/GPT-4
  if (keys.openai) {
    registry.registerProvider(
      'openai',
      (config) => new GPT4Agent(config, { apiKey: keys.openai }),
      DEFAULT_MODELS.openai
    );
  } else {
    warnings.push('GPT-4 agent not available: OPENAI_API_KEY not set');
  }

  // Register Google/Gemini
  if (keys.google) {
    registry.registerProvider(
      'google',
      (config) => new GeminiAgent(config, { apiKey: keys.google }),
      DEFAULT_MODELS.google
    );
  } else {
    warnings.push('Gemini agent not available: GOOGLE_AI_API_KEY not set');
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
      console.warn(`Could not create default agent for ${provider}:`, error);
    }
  }

  return agents;
}

/**
 * Full setup: register providers and create default agents
 *
 * @param registry - Agent registry to configure
 * @param apiKeys - Optional API key configuration
 * @returns Complete setup result
 */
export function setupAgents(
  registry: AgentRegistry,
  apiKeys?: ApiKeyConfig
): SetupResult {
  // First, setup providers
  const result = setupProviders(registry, apiKeys);

  // Then, create default agents
  const agents = createDefaultAgents(registry);
  result.agents = agents;

  // Check if any agents were created
  if (agents.length === 0) {
    result.warnings.push(
      'No agents available. Please set at least one API key: ' +
        'ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, or PERPLEXITY_API_KEY'
    );
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
