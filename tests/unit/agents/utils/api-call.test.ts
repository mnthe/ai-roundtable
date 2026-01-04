import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callWithResilience } from '../../../../src/agents/utils/api-call.js';
import { rateLimiter } from '../../../../src/utils/rate-limiter.js';
import { RoundtableError } from '../../../../src/errors/index.js';

describe('callWithResilience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should execute function successfully', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await callWithResilience('anthropic', fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const retryableError = new RoundtableError('Temporary failure', {
      code: 'API_ERROR',
      retryable: true,
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('success');

    const resultPromise = callWithResilience('anthropic', fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const nonRetryableError = new RoundtableError('Invalid input', {
      code: 'VALIDATION_ERROR',
      retryable: false,
    });
    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    await expect(callWithResilience('anthropic', fn)).rejects.toThrow(nonRetryableError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after max retries exceeded', async () => {
    const retryableError = new RoundtableError('Persistent failure', {
      code: 'API_ERROR',
      retryable: true,
    });
    const fn = vi.fn().mockRejectedValue(retryableError);

    const resultPromise = callWithResilience('anthropic', fn);

    const expectation = expect(resultPromise).rejects.toThrow('Persistent failure');
    await vi.runAllTimersAsync();
    await expectation;

    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('should respect rate limiting', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    await rateLimiter.acquire('anthropic', 49);

    const resultPromise = callWithResilience('anthropic', fn);

    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await resultPromise;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should work with different providers', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    await callWithResilience('openai', fn);
    await callWithResilience('google', fn);
    await callWithResilience('perplexity', fn);

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should combine rate limiting and retry correctly', async () => {
    const retryableError = new RoundtableError('Temporary', {
      code: 'API_ERROR',
      retryable: true,
    });
    const fn = vi.fn().mockRejectedValueOnce(retryableError).mockResolvedValue('success');

    const resultPromise = callWithResilience('anthropic', fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
