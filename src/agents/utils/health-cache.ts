/**
 * Health Cache - TTL-based cache for agent health check results
 *
 * Prevents redundant health check API calls by caching results with a configurable TTL.
 * This significantly reduces latency for operations that repeatedly check agent health,
 * such as getOrCreateLightAgent calls.
 */

/**
 * Entry structure for cached health status
 */
interface HealthCacheEntry {
  healthy: boolean;
  timestamp: number;
}

/**
 * In-memory cache for health check results
 */
const HEALTH_CACHE = new Map<string, HealthCacheEntry>();

/** Default TTL: 60 seconds */
const DEFAULT_HEALTH_TTL_MS = 60_000;

/**
 * Get cached health status for an agent
 *
 * Returns the cached health status if available and not expired.
 * Returns null if not in cache or if the TTL has expired.
 *
 * @param agentId - The unique identifier for the agent
 * @param ttlMs - Time-to-live in milliseconds (default: 60 seconds)
 * @returns Cached health status (true/false) or null if not cached/expired
 *
 * @example
 * ```typescript
 * const cachedHealth = getCachedHealthStatus('claude-1');
 * if (cachedHealth !== null) {
 *   // Use cached result
 *   console.log(`Agent is ${cachedHealth ? 'healthy' : 'unhealthy'}`);
 * } else {
 *   // Perform actual health check
 *   const health = await agent.healthCheck();
 *   setCachedHealthStatus('claude-1', health.healthy);
 * }
 * ```
 */
export function getCachedHealthStatus(
  agentId: string,
  ttlMs: number = DEFAULT_HEALTH_TTL_MS
): boolean | null {
  const entry = HEALTH_CACHE.get(agentId);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > ttlMs) {
    HEALTH_CACHE.delete(agentId);
    return null;
  }

  return entry.healthy;
}

/**
 * Cache health status for an agent
 *
 * Stores the health status with the current timestamp for TTL expiration.
 *
 * @param agentId - The unique identifier for the agent
 * @param healthy - Whether the agent is healthy
 *
 * @example
 * ```typescript
 * const health = await agent.healthCheck();
 * setCachedHealthStatus(agent.id, health.healthy);
 * ```
 */
export function setCachedHealthStatus(agentId: string, healthy: boolean): void {
  HEALTH_CACHE.set(agentId, { healthy, timestamp: Date.now() });
}

/**
 * Clear all cached health statuses
 *
 * Useful for testing or when a forced refresh of all health statuses is needed.
 *
 * @example
 * ```typescript
 * // In test setup
 * beforeEach(() => {
 *   clearHealthCache();
 * });
 * ```
 */
export function clearHealthCache(): void {
  HEALTH_CACHE.clear();
}

/**
 * Get the current cache size
 *
 * Useful for debugging, monitoring, or testing.
 *
 * @returns Number of entries currently in the cache
 *
 * @example
 * ```typescript
 * console.log(`Health cache has ${getHealthCacheSize()} entries`);
 * ```
 */
export function getHealthCacheSize(): number {
  return HEALTH_CACHE.size;
}

/**
 * Default TTL constant for external configuration
 */
export const DEFAULT_HEALTH_CACHE_TTL_MS = DEFAULT_HEALTH_TTL_MS;
