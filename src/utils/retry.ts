/**
 * Retry utility with exponential backoff and jitter
 */

import { RoundtableError } from '../errors/index.js';
import { createLogger } from './logger.js';

const logger = createLogger('Retry');

export interface RetryOptions {
  /**
   * Maximum number of retry attempts AFTER the initial attempt.
   * Total attempts = 1 (initial) + maxRetries.
   *
   * @example
   * - maxRetries=0: 1 attempt total (no retries)
   * - maxRetries=1: 2 attempts total (1 initial + 1 retry)
   * - maxRetries=3: 4 attempts total (1 initial + 3 retries)
   *
   * @default 3
   */
  maxRetries: number;

  /**
   * Initial delay in milliseconds
   * @default 1000
   */
  baseDelay: number;

  /**
   * Maximum delay in milliseconds
   * @default 30000
   */
  maxDelay: number;

  /**
   * Exponential backoff factor
   * @default 2
   */
  backoffFactor: number;

  /**
   * List of error codes that should trigger a retry
   * If not provided, only RoundtableError with retryable=true will be retried
   */
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
};

/**
 * Calculate delay with exponential backoff and jitter
 * Uses "full jitter" strategy: random value between 0 and cappedDelay
 * This helps prevent thundering herd by spreading out retries
 *
 * The effective delay range for each attempt:
 * - Attempt 0: [0, baseDelay]
 * - Attempt 1: [0, baseDelay * backoffFactor]
 * - Attempt N: [0, min(baseDelay * backoffFactor^N, maxDelay)]
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  backoffFactor: number
): number {
  // Exponential backoff: baseDelay * (backoffFactor ^ attempt)
  const exponentialDelay = baseDelay * Math.pow(backoffFactor, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Full jitter: random value between 0.5 * cappedDelay and cappedDelay
  // This ensures we always wait at least half the calculated delay
  // while still providing enough randomization to prevent thundering herd
  const minDelay = cappedDelay * 0.5;
  const jitter = Math.random() * (cappedDelay - minDelay);

  return minDelay + jitter;
}

/**
 * Check if an error should be retried
 */
function isRetryableError(
  error: unknown,
  retryableErrors?: string[]
): boolean {
  // If it's a RoundtableError, check the retryable flag
  if (error instanceof RoundtableError) {
    // If specific error codes are provided, check if this error code is in the list
    if (retryableErrors && retryableErrors.length > 0) {
      return retryableErrors.includes(error.code);
    }
    // Otherwise, use the error's retryable flag
    return error.retryable;
  }

  // Non-RoundtableError: only retry if explicitly listed
  if (retryableErrors && retryableErrors.length > 0 && error instanceof Error) {
    return retryableErrors.includes(error.name);
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Sleep for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 *
 * @param fn - The async function to execute
 * @param options - Retry options (see {@link RetryOptions})
 * @returns Promise that resolves with the function result
 * @throws The original error if max retries exceeded or error is not retryable
 *
 * @remarks
 * The `maxRetries` option specifies the number of retry attempts AFTER the initial attempt.
 * With `maxRetries=3` (default), the function will be called up to 4 times total:
 * 1 initial attempt + 3 retries.
 *
 * @example
 * ```typescript
 * // Will attempt up to 6 times (1 initial + 5 retries)
 * const result = await withRetry(
 *   async () => await apiCall(),
 *   { maxRetries: 5, baseDelay: 2000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Execute the function
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = isRetryableError(error, opts.retryableErrors);
      const hasRetriesLeft = attempt < opts.maxRetries;

      if (!shouldRetry || !hasRetriesLeft) {
        // Don't retry: either error is not retryable or we've exhausted retries
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = calculateDelay(
        attempt,
        opts.baseDelay,
        opts.maxDelay,
        opts.backoffFactor
      );

      // Log retry attempt at debug level
      logger.debug(
        {
          attempt: attempt + 1,
          maxRetries: opts.maxRetries,
          delayMs: Math.round(delay),
          error: error instanceof Error ? error.message : String(error),
        },
        'Retry attempt'
      );

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retry wrapper function with predefined options
 *
 * @param options - Default retry options
 * @returns A function that executes with retry logic
 *
 * @example
 * ```typescript
 * const retryWithDefaults = createRetryWrapper({ maxRetries: 5 });
 * const result = await retryWithDefaults(() => apiCall());
 * ```
 */
export function createRetryWrapper(
  options: Partial<RetryOptions>
): <T>(fn: () => Promise<T>) => Promise<T> {
  return <T>(fn: () => Promise<T>) => withRetry(fn, options);
}
