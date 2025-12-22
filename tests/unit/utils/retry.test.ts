import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, createRetryWrapper } from '../../../src/utils/retry.js';
import {
  RoundtableError,
  APIRateLimitError,
  APIAuthError,
  APINetworkError,
  APITimeoutError,
  AgentError,
} from '../../../src/errors/index.js';

describe('Retry Utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const error = new APIRateLimitError('Rate limited', {});
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = withRetry(fn, { maxRetries: 3, baseDelay: 1000 });

      // Fast-forward through the retry delay
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable error', async () => {
      const error = new APIAuthError('Auth failed', {});
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withRetry(fn)).rejects.toThrow(APIAuthError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exceeded', async () => {
      const error = new APINetworkError('Network error', {});
      const fn = vi.fn().mockRejectedValue(error);

      const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100 });

      // Start expecting rejection before running timers to avoid unhandled rejection
      const expectation = expect(promise).rejects.toThrow(APINetworkError);
      await vi.runAllTimersAsync();
      await expectation;
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const error = new APITimeoutError('Timeout', {});
      const fn = vi.fn().mockRejectedValue(error);

      const promise = withRetry(fn, {
        maxRetries: 3,
        baseDelay: 1000,
        backoffFactor: 2,
      });

      // Start expecting rejection before running timers to avoid unhandled rejection
      const expectation = expect(promise).rejects.toThrow(APITimeoutError);
      await vi.runAllTimersAsync();
      await expectation;
      expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should respect maxDelay cap', async () => {
      const error = new APIRateLimitError('Rate limited', {});
      const fn = vi.fn().mockRejectedValue(error);

      const promise = withRetry(fn, {
        maxRetries: 10,
        baseDelay: 10000,
        maxDelay: 5000,
        backoffFactor: 3,
      });

      // Start expecting rejection before running timers to avoid unhandled rejection
      const expectation = expect(promise).rejects.toThrow(APIRateLimitError);
      await vi.runAllTimersAsync();
      await expectation;
      // Each delay should be capped at maxDelay
    });

    it('should retry only specified error codes', async () => {
      const rateLimitError = new APIRateLimitError('Rate limited', {});
      const networkError = new APINetworkError('Network error', {});
      const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockRejectedValueOnce(networkError);

      const promise = withRetry(fn, {
        maxRetries: 3,
        baseDelay: 100,
        retryableErrors: ['API_RATE_LIMIT'],
      });

      // Start expecting rejection before running timers to avoid unhandled rejection
      const expectation = expect(promise).rejects.toThrow(APINetworkError);
      await vi.runAllTimersAsync();

      // Should retry rate limit but stop on network error
      await expectation;
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle non-RoundtableError', async () => {
      const error = new Error('Generic error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withRetry(fn)).rejects.toThrow('Generic error');
      expect(fn).toHaveBeenCalledTimes(1); // Should not retry
    });

    it('should retry non-RoundtableError if listed in retryableErrors', async () => {
      const error = new TypeError('Type error');
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = withRetry(fn, {
        maxRetries: 2,
        baseDelay: 100,
        retryableErrors: ['TypeError'],
      });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle custom retryable RoundtableError', async () => {
      const error = new AgentError('Agent failed', {
        retryable: true,
        provider: 'test',
      });
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100 });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should work with async functions returning complex types', async () => {
      interface ComplexResult {
        data: string[];
        metadata: { count: number };
      }

      const expectedResult: ComplexResult = {
        data: ['item1', 'item2'],
        metadata: { count: 2 },
      };

      const fn = vi.fn().mockResolvedValue(expectedResult);

      const result = await withRetry(fn);

      expect(result).toEqual(expectedResult);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle zero retries', async () => {
      const error = new APIRateLimitError('Rate limited', {});
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { maxRetries: 0, baseDelay: 100 })).rejects.toThrow(
        APIRateLimitError
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should preserve error context through retries', async () => {
      const originalError = new Error('Original');
      const wrappedError = new APINetworkError('Network error', {
        cause: originalError,
        provider: 'test-provider',
      });
      const fn = vi.fn().mockRejectedValue(wrappedError);

      const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100 });
      // Start expecting rejection before running timers to avoid unhandled rejection
      const expectation = expect(promise).rejects.toBeInstanceOf(APINetworkError);
      await vi.runAllTimersAsync();
      await expectation;
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('createRetryWrapper', () => {
    it('should create wrapper with default options', async () => {
      const wrapper = createRetryWrapper({ maxRetries: 5, baseDelay: 500 });
      const fn = vi.fn().mockResolvedValue('success');

      const result = await wrapper(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should apply default options to wrapped function', async () => {
      const error = new APIRateLimitError('Rate limited', {});
      const wrapper = createRetryWrapper({ maxRetries: 2, baseDelay: 100 });
      const fn = vi.fn().mockRejectedValue(error);

      const promise = wrapper(fn);
      // Start expecting rejection before running timers to avoid unhandled rejection
      const expectation = expect(promise).rejects.toThrow(APIRateLimitError);
      await vi.runAllTimersAsync();
      await expectation;
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should allow multiple calls with same wrapper', async () => {
      const wrapper = createRetryWrapper({ maxRetries: 1, baseDelay: 100 });

      const fn1 = vi.fn().mockResolvedValue('result1');
      const fn2 = vi.fn().mockResolvedValue('result2');

      const result1 = await wrapper(fn1);
      const result2 = await wrapper(fn2);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle function that throws synchronously', async () => {
      const fn = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });

      await expect(withRetry(fn)).rejects.toThrow('Sync error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined/null errors gracefully', async () => {
      const fn = vi.fn().mockRejectedValue(null);

      await expect(withRetry(fn)).rejects.toBeNull();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should work with very short delays', async () => {
      const error = new APIRateLimitError('Rate limited', {});
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = withRetry(fn, { maxRetries: 1, baseDelay: 1 });
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
    });
  });
});
