/**
 * Integration Test Setup
 *
 * This file is run before each integration test file.
 * It loads environment variables and sets up the test environment.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables:
// 1. Load .env first (base configuration with API keys)
// 2. Load .env.test second (override with test-specific settings)
const basePath = resolve(process.cwd(), '.env');
const testPath = resolve(process.cwd(), '.env.test');

// Load base .env (API keys, etc.)
config({ path: basePath });

// Load .env.test to override specific values (like SKIP_PROVIDERS)
config({ path: testPath, override: true });

export type Provider = 'anthropic' | 'openai' | 'google' | 'perplexity';

/**
 * Cache for provider health check results
 * Prevents multiple API calls during test runs
 */
const healthCheckCache = new Map<Provider, { healthy: boolean; error?: string }>();

/**
 * List of providers that should be skipped (set via SKIP_PROVIDERS env var)
 */
const skippedProviders = new Set<Provider>(
  (process.env.SKIP_PROVIDERS || '').split(',').filter(Boolean) as Provider[]
);

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
 * Check if a specific provider is available for testing (has API key configured)
 */
export function isProviderAvailable(provider: Provider): boolean {
  const config = getTestConfig();

  if (config.skipRealApiTests) {
    return false;
  }

  if (skippedProviders.has(provider)) {
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
 * Check if a provider passed its health check
 * Returns cached result if available
 */
export function isProviderHealthy(provider: Provider): boolean {
  const cached = healthCheckCache.get(provider);
  if (cached !== undefined) {
    return cached.healthy;
  }
  // If no health check has been done yet, assume healthy if available
  return isProviderAvailable(provider);
}

/**
 * Mark a provider as unhealthy (e.g., after auth failure)
 */
export function markProviderUnhealthy(provider: Provider, error: string): void {
  healthCheckCache.set(provider, { healthy: false, error });
  console.log(`⚠️  Provider ${provider} marked unhealthy: ${error}`);
}

/**
 * Mark a provider as healthy (e.g., after successful API call)
 */
export function markProviderHealthy(provider: Provider): void {
  healthCheckCache.set(provider, { healthy: true });
}

/**
 * Get health check status for a provider
 */
export function getProviderHealthStatus(
  provider: Provider
): { healthy: boolean; error?: string } | undefined {
  return healthCheckCache.get(provider);
}

/**
 * Skip test if provider is not available
 */
export function skipIfNoProvider(provider: Provider): void {
  if (!isProviderAvailable(provider)) {
    const config = getTestConfig();
    if (config.skipRealApiTests) {
      console.log(`Skipping ${provider} tests: SKIP_REAL_API_TESTS is set`);
    } else if (skippedProviders.has(provider)) {
      console.log(`Skipping ${provider} tests: SKIP_PROVIDERS includes ${provider}`);
    } else {
      console.log(`Skipping ${provider} tests: API key not configured`);
    }
  }
}

/**
 * Get available providers for testing (API key exists)
 */
export function getAvailableProviders(): Provider[] {
  const providers: Provider[] = [];

  if (isProviderAvailable('anthropic')) providers.push('anthropic');
  if (isProviderAvailable('openai')) providers.push('openai');
  if (isProviderAvailable('google')) providers.push('google');
  if (isProviderAvailable('perplexity')) providers.push('perplexity');

  return providers;
}

/**
 * Get healthy providers for testing (API key exists AND health check passed)
 */
export function getHealthyProviders(): Provider[] {
  return getAvailableProviders().filter((p) => isProviderHealthy(p));
}

/**
 * Check if an error is an auth/credit-related error that should mark provider as unhealthy
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Common auth/credit error patterns
    return (
      name.includes('auth') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('invalid api key') ||
      message.includes('insufficient') ||
      message.includes('quota') ||
      message.includes('credit')
    );
  }
  return false;
}

/**
 * Wrapper for tests that handles auth errors gracefully
 * If an auth error occurs, marks the provider as unhealthy and skips the test
 */
export async function withProviderErrorHandling<T>(
  provider: Provider,
  testFn: () => Promise<T>
): Promise<T> {
  try {
    const result = await testFn();
    markProviderHealthy(provider);
    return result;
  } catch (error) {
    if (isAuthError(error)) {
      const errorMsg = error instanceof Error ? error.message.slice(0, 100) : String(error);
      markProviderUnhealthy(provider, errorMsg);
      throw new Error(`SKIP: ${provider} auth error - ${errorMsg}`);
    }
    throw error;
  }
}

// Log test environment info
console.log('\n=== Integration Test Environment ===');
console.log(`Skip Real API Tests: ${getTestConfig().skipRealApiTests}`);
console.log(`Available Providers: ${getAvailableProviders().join(', ') || 'none (using mocks)'}`);
if (skippedProviders.size > 0) {
  console.log(`Skipped Providers: ${Array.from(skippedProviders).join(', ')}`);
}
console.log('=====================================\n');
