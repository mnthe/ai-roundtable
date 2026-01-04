import { APIRateLimitError } from '../errors/index.js';
import { AGENT_DEFAULTS } from '../config/agent-defaults.js';
import type { AIProvider } from '../types/index.js';

export interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
  refillIntervalMs: number;
}

const DEFAULT_CONFIGS: Record<AIProvider, RateLimiterConfig> = {
  anthropic: { maxTokens: 50, refillRate: 10, refillIntervalMs: 1000 },
  openai: { maxTokens: 60, refillRate: 12, refillIntervalMs: 1000 },
  google: { maxTokens: 60, refillRate: 12, refillIntervalMs: 1000 },
  perplexity: { maxTokens: 20, refillRate: 4, refillIntervalMs: 1000 },
};

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  config: RateLimiterConfig;
}

class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private customConfigs: Map<AIProvider, RateLimiterConfig> = new Map();

  configure(provider: AIProvider, config: Partial<RateLimiterConfig>): void {
    const defaultConfig = DEFAULT_CONFIGS[provider];
    this.customConfigs.set(provider, { ...defaultConfig, ...config });
  }

  private getConfig(provider: AIProvider): RateLimiterConfig {
    return this.customConfigs.get(provider) ?? DEFAULT_CONFIGS[provider];
  }

  private getBucket(provider: AIProvider): TokenBucket {
    let bucket = this.buckets.get(provider);
    if (!bucket) {
      const config = this.getConfig(provider);
      bucket = {
        tokens: config.maxTokens,
        lastRefill: Date.now(),
        config,
      };
      this.buckets.set(provider, bucket);
    }
    return bucket;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / bucket.config.refillIntervalMs);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * bucket.config.refillRate;
      bucket.tokens = Math.min(bucket.config.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  async acquire(provider: AIProvider, tokens: number = 1): Promise<void> {
    const bucket = this.getBucket(provider);
    this.refillBucket(bucket);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return;
    }

    const tokensNeeded = tokens - bucket.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / bucket.config.refillRate);
    const waitTimeMs = intervalsNeeded * bucket.config.refillIntervalMs;

    if (waitTimeMs > AGENT_DEFAULTS.RATE_LIMIT_WAIT_THRESHOLD_MS) {
      throw new APIRateLimitError(
        `Rate limit exceeded for ${provider}. Would need to wait ${Math.round(waitTimeMs / 1000)}s`,
        {
          provider,
          retryable: true,
        }
      );
    }

    await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
    this.refillBucket(bucket);
    bucket.tokens -= tokens;
  }

  tryAcquire(provider: AIProvider, tokens: number = 1): boolean {
    const bucket = this.getBucket(provider);
    this.refillBucket(bucket);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }
    return false;
  }

  getAvailableTokens(provider: AIProvider): number {
    const bucket = this.getBucket(provider);
    this.refillBucket(bucket);
    return bucket.tokens;
  }

  reset(provider?: AIProvider): void {
    if (provider) {
      this.buckets.delete(provider);
    } else {
      this.buckets.clear();
      this.customConfigs.clear();
    }
  }
}

export const rateLimiter = new RateLimiter();

export async function withRateLimit<T>(
  provider: AIProvider,
  fn: () => Promise<T>,
  tokens: number = 1
): Promise<T> {
  await rateLimiter.acquire(provider, tokens);
  return fn();
}
