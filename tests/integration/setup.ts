/**
 * Integration Test Setup
 *
 * This file is run before each integration test file.
 * It loads environment variables and sets up the test environment.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.test or .env
const envPath = resolve(process.cwd(), '.env.test');
const fallbackEnvPath = resolve(process.cwd(), '.env');

const result = config({ path: envPath });
if (result.error) {
  // Try fallback .env file
  config({ path: fallbackEnvPath });
}

/**
 * Environment configuration for integration tests
 */
export interface IntegrationTestConfig {
  // API Keys
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  perplexityApiKey?: string;

  // Test configuration
  skipRealApiTests: boolean;
  testTimeout: number;
}

/**
 * Get integration test configuration from environment
 */
export function getTestConfig(): IntegrationTestConfig {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    perplexityApiKey: process.env.PERPLEXITY_API_KEY,
    skipRealApiTests: process.env.SKIP_REAL_API_TESTS === 'true',
    testTimeout: parseInt(process.env.TEST_TIMEOUT || '60000', 10),
  };
}

/**
 * Check if a specific provider is available for testing
 */
export function isProviderAvailable(provider: 'anthropic' | 'openai' | 'google' | 'perplexity'): boolean {
  const config = getTestConfig();

  if (config.skipRealApiTests) {
    return false;
  }

  switch (provider) {
    case 'anthropic':
      return !!config.anthropicApiKey;
    case 'openai':
      return !!config.openaiApiKey;
    case 'google':
      return !!config.googleApiKey;
    case 'perplexity':
      return !!config.perplexityApiKey;
    default:
      return false;
  }
}

/**
 * Skip test if provider is not available
 */
export function skipIfNoProvider(provider: 'anthropic' | 'openai' | 'google' | 'perplexity'): void {
  if (!isProviderAvailable(provider)) {
    const config = getTestConfig();
    if (config.skipRealApiTests) {
      console.log(`Skipping ${provider} tests: SKIP_REAL_API_TESTS is set`);
    } else {
      console.log(`Skipping ${provider} tests: API key not configured`);
    }
  }
}

/**
 * Get available providers for testing
 */
export function getAvailableProviders(): ('anthropic' | 'openai' | 'google' | 'perplexity')[] {
  const providers: ('anthropic' | 'openai' | 'google' | 'perplexity')[] = [];

  if (isProviderAvailable('anthropic')) providers.push('anthropic');
  if (isProviderAvailable('openai')) providers.push('openai');
  if (isProviderAvailable('google')) providers.push('google');
  if (isProviderAvailable('perplexity')) providers.push('perplexity');

  return providers;
}

// Log test environment info
console.log('\n=== Integration Test Environment ===');
console.log(`Skip Real API Tests: ${getTestConfig().skipRealApiTests}`);
console.log(`Available Providers: ${getAvailableProviders().join(', ') || 'none (using mocks)'}`);
console.log('=====================================\n');
