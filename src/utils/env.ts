/**
 * Environment Variable Utilities
 *
 * Provides type-safe access to environment variables with validation
 * and default value support.
 */

/**
 * Get an environment variable or throw if not set
 *
 * @param key - Environment variable name
 * @param description - Human-readable description for error messages
 * @throws Error if the environment variable is not set
 *
 * @example
 * const apiKey = getEnvOrThrow('ANTHROPIC_API_KEY', 'Anthropic API key');
 */
export function getEnvOrThrow(key: string, description?: string): string {
  const value = process.env[key];
  if (!value) {
    const desc = description ? ` (${description})` : '';
    throw new Error(`Environment variable ${key}${desc} is required but not set`);
  }
  return value;
}

/**
 * Get an environment variable with a default value
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set or empty
 *
 * @example
 * const logLevel = getEnvWithDefault('LOG_LEVEL', 'info');
 * const dbPath = getEnvWithDefault('DATABASE_PATH', './data/roundtable.db');
 */
export function getEnvWithDefault(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value || defaultValue;
}

/**
 * Get an optional environment variable (returns undefined if not set)
 *
 * @param key - Environment variable name
 *
 * @example
 * const apiKey = getEnvOptional('ANTHROPIC_API_KEY');
 * if (apiKey) {
 *   // Use the API key
 * }
 */
export function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

/**
 * Check if an environment variable is set (non-empty)
 *
 * @param key - Environment variable name
 *
 * @example
 * if (hasEnv('ANTHROPIC_API_KEY')) {
 *   // Claude agent is available
 * }
 */
export function hasEnv(key: string): boolean {
  return !!process.env[key];
}

/**
 * Get an environment variable as a boolean
 *
 * Treats 'true', '1', 'yes' (case-insensitive) as true, everything else as false
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 *
 * @example
 * const skipTests = getEnvBoolean('SKIP_REAL_API_TESTS', false);
 */
export function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

/**
 * Get an environment variable as a number
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set or invalid
 *
 * @example
 * const timeout = getEnvNumber('TEST_TIMEOUT', 60000);
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
