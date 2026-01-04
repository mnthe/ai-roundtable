import { withRetry } from '../../utils/retry.js';
import { withRateLimit } from '../../utils/rate-limiter.js';
import { AGENT_DEFAULTS } from '../../config/agent-defaults.js';
import type { AIProvider } from '../../types/index.js';

/**
 * Execute API call with rate limiting and retry logic combined.
 * Ensures consistent resilience behavior across all agent implementations.
 */
export async function callWithResilience<T>(
  provider: AIProvider,
  fn: () => Promise<T>
): Promise<T> {
  return withRetry(() => withRateLimit(provider, fn), {
    maxRetries: AGENT_DEFAULTS.MAX_RETRIES,
  });
}
