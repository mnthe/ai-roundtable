/**
 * Provider Configuration
 *
 * Centralized configuration for AI providers including:
 * - API key detection from environment variables
 * - Default model assignments (heavy and light variants)
 * - Provider availability checking
 *
 * Environment variables:
 * - ANTHROPIC_API_KEY: Anthropic/Claude API key
 * - OPENAI_API_KEY: OpenAI/ChatGPT API key
 * - GOOGLE_API_KEY: Google/Gemini API key
 * - PERPLEXITY_API_KEY: Perplexity API key
 */

import type { AIProvider } from '../types/index.js';
import { getEnvOptional } from '../utils/env.js';

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
 * Default models for each provider (heavy models for debate)
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-5.2',
  google: 'gemini-3.0-flash',
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
 * Default agent names for display
 */
export const DEFAULT_AGENT_NAMES: Record<AIProvider, string> = {
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
    anthropic: getEnvOptional('ANTHROPIC_API_KEY'),
    openai: getEnvOptional('OPENAI_API_KEY'),
    google: getEnvOptional('GOOGLE_API_KEY'),
    perplexity: getEnvOptional('PERPLEXITY_API_KEY'),
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
