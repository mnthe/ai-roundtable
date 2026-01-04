import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimiter, withRateLimit } from '../../../src/utils/rate-limiter.js';
import { APIRateLimitError } from '../../../src/errors/index.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('acquire', () => {
    it('should acquire tokens immediately when available', async () => {
      await rateLimiter.acquire('anthropic', 1);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(49);
    });

    it('should acquire multiple tokens at once', async () => {
      await rateLimiter.acquire('anthropic', 10);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(40);
    });

    it('should wait when tokens are depleted', async () => {
      await rateLimiter.acquire('anthropic', 50);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(0);

      const acquirePromise = rateLimiter.acquire('anthropic', 5);

      await vi.runAllTimersAsync();

      await acquirePromise;
      expect(rateLimiter.getAvailableTokens('anthropic')).toBeLessThanOrEqual(5);
    });

    it('should throw APIRateLimitError if wait time exceeds threshold', async () => {
      rateLimiter.configure('anthropic', {
        maxTokens: 10,
        refillRate: 1,
        refillIntervalMs: 10000,
      });
      rateLimiter.reset('anthropic');

      await rateLimiter.acquire('anthropic', 10);

      await expect(rateLimiter.acquire('anthropic', 10)).rejects.toThrow(APIRateLimitError);
    });

    it('should refill tokens over time', async () => {
      await rateLimiter.acquire('anthropic', 50);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(0);

      await vi.advanceTimersByTimeAsync(1000);

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(10);
    });

    it('should cap refill at maxTokens', async () => {
      await rateLimiter.acquire('anthropic', 10);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(40);

      await vi.advanceTimersByTimeAsync(10000);

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(50);
    });
  });

  describe('tryAcquire', () => {
    it('should return true when tokens available', () => {
      const result = rateLimiter.tryAcquire('anthropic', 1);
      expect(result).toBe(true);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(49);
    });

    it('should return false when tokens not available', async () => {
      await rateLimiter.acquire('anthropic', 50);
      const result = rateLimiter.tryAcquire('anthropic', 1);
      expect(result).toBe(false);
    });

    it('should not block when tokens unavailable', async () => {
      await rateLimiter.acquire('anthropic', 50);
      const start = Date.now();
      rateLimiter.tryAcquire('anthropic', 10);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return current token count', () => {
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(50);
    });

    it('should reflect tokens after acquisition', async () => {
      await rateLimiter.acquire('anthropic', 25);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(25);
    });

    it('should include refilled tokens', async () => {
      await rateLimiter.acquire('anthropic', 50);
      await vi.advanceTimersByTimeAsync(2000);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(20);
    });
  });

  describe('reset', () => {
    it('should reset specific provider bucket', async () => {
      await rateLimiter.acquire('anthropic', 30);
      await rateLimiter.acquire('openai', 30);

      rateLimiter.reset('anthropic');

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(50);
      expect(rateLimiter.getAvailableTokens('openai')).toBe(30);
    });

    it('should reset all buckets when no provider specified', async () => {
      await rateLimiter.acquire('anthropic', 30);
      await rateLimiter.acquire('openai', 30);
      await rateLimiter.acquire('google', 30);

      rateLimiter.reset();

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(50);
      expect(rateLimiter.getAvailableTokens('openai')).toBe(60);
      expect(rateLimiter.getAvailableTokens('google')).toBe(60);
    });

    it('should preserve custom config when resetting specific provider', async () => {
      rateLimiter.configure('anthropic', { maxTokens: 100 });
      rateLimiter.reset('anthropic');

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(100);
    });

    it('should clear custom configs when resetting all', async () => {
      rateLimiter.configure('anthropic', { maxTokens: 100 });
      rateLimiter.reset('anthropic');
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(100);

      rateLimiter.reset();
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(50);
    });
  });

  describe('configure', () => {
    it('should allow custom configuration per provider', async () => {
      rateLimiter.configure('anthropic', {
        maxTokens: 100,
        refillRate: 20,
      });
      rateLimiter.reset('anthropic');

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(100);

      await rateLimiter.acquire('anthropic', 100);
      await vi.advanceTimersByTimeAsync(1000);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(20);
    });

    it('should merge with default config', async () => {
      rateLimiter.configure('anthropic', { maxTokens: 100 });
      rateLimiter.reset('anthropic');

      await rateLimiter.acquire('anthropic', 100);
      await vi.advanceTimersByTimeAsync(1000);
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(10);
    });
  });

  describe('default provider configs', () => {
    it('should have correct default for anthropic', () => {
      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(50);
    });

    it('should have correct default for openai', () => {
      expect(rateLimiter.getAvailableTokens('openai')).toBe(60);
    });

    it('should have correct default for google', () => {
      expect(rateLimiter.getAvailableTokens('google')).toBe(60);
    });

    it('should have correct default for perplexity', () => {
      expect(rateLimiter.getAvailableTokens('perplexity')).toBe(20);
    });
  });

  describe('concurrent access', () => {
    it('should handle multiple concurrent acquisitions', async () => {
      const promises = [
        rateLimiter.acquire('anthropic', 10),
        rateLimiter.acquire('anthropic', 10),
        rateLimiter.acquire('anthropic', 10),
      ];

      await Promise.all(promises);

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(20);
    });

    it('should handle acquisitions from different providers independently', async () => {
      await Promise.all([
        rateLimiter.acquire('anthropic', 25),
        rateLimiter.acquire('openai', 30),
        rateLimiter.acquire('google', 30),
      ]);

      expect(rateLimiter.getAvailableTokens('anthropic')).toBe(25);
      expect(rateLimiter.getAvailableTokens('openai')).toBe(30);
      expect(rateLimiter.getAvailableTokens('google')).toBe(30);
    });
  });
});

describe('withRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should execute function after acquiring token', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    const result = await withRateLimit('anthropic', fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(rateLimiter.getAvailableTokens('anthropic')).toBe(49);
  });

  it('should wait for tokens before executing', async () => {
    await rateLimiter.acquire('anthropic', 50);

    const fn = vi.fn().mockResolvedValue('result');
    const promise = withRateLimit('anthropic', fn);

    expect(fn).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass through errors from the wrapped function', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('API error'));

    await expect(withRateLimit('anthropic', fn)).rejects.toThrow('API error');
  });

  it('should acquire specified number of tokens', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    await withRateLimit('anthropic', fn, 5);

    expect(rateLimiter.getAvailableTokens('anthropic')).toBe(45);
  });

  it('should support different providers', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    await withRateLimit('openai', fn);
    await withRateLimit('google', fn);
    await withRateLimit('perplexity', fn);

    expect(rateLimiter.getAvailableTokens('openai')).toBe(59);
    expect(rateLimiter.getAvailableTokens('google')).toBe(59);
    expect(rateLimiter.getAvailableTokens('perplexity')).toBe(19);
  });
});
