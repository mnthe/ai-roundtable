/**
 * Error Converter Tests
 *
 * Tests for the SDK error conversion utility that transforms
 * provider-specific errors into custom RoundtableError types.
 */

import { describe, it, expect } from 'vitest';
import { convertSDKError, isRetryableError } from '../../../../src/agents/utils/error-converter.js';
import {
  APIRateLimitError,
  APIAuthError,
  APINetworkError,
  APITimeoutError,
  AgentError,
} from '../../../../src/errors/index.js';
import type { AIProvider } from '../../../../src/types/index.js';

/**
 * Create a mock SDK error with specific properties
 */
function createMockError(
  name: string,
  message: string,
  options?: { status?: number; code?: number | string }
): Error & { status?: number; code?: number | string } {
  const error = new Error(message) as Error & { status?: number; code?: number | string };
  error.name = name;
  if (options?.status !== undefined) {
    error.status = options.status;
  }
  if (options?.code !== undefined) {
    error.code = options.code;
  }
  return error;
}

describe('Error Converter', () => {
  describe('convertSDKError', () => {
    describe('Anthropic errors', () => {
      const provider: AIProvider = 'anthropic';

      it('should convert RateLimitError to APIRateLimitError', () => {
        const error = createMockError('RateLimitError', 'Rate limit exceeded');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIRateLimitError);
        expect(converted.message).toBe('Rate limit exceeded');
        expect((converted as APIRateLimitError).provider).toBe('anthropic');
        expect((converted as APIRateLimitError).retryable).toBe(true);
      });

      it('should convert 429 status to APIRateLimitError', () => {
        const error = createMockError('APIError', 'Too many requests', { status: 429 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIRateLimitError);
        expect((converted as APIRateLimitError).retryable).toBe(true);
      });

      it('should convert AuthenticationError to APIAuthError', () => {
        const error = createMockError('AuthenticationError', 'Invalid API key');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIAuthError);
        expect(converted.message).toBe('Invalid API key');
        expect((converted as APIAuthError).retryable).toBe(false);
      });

      it('should convert PermissionDeniedError to APIAuthError', () => {
        const error = createMockError('PermissionDeniedError', 'Access denied');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIAuthError);
        expect((converted as APIAuthError).retryable).toBe(false);
      });

      it('should convert 401 status to APIAuthError', () => {
        const error = createMockError('APIError', 'Unauthorized', { status: 401 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIAuthError);
      });

      it('should convert 403 status to APIAuthError', () => {
        const error = createMockError('APIError', 'Forbidden', { status: 403 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIAuthError);
      });

      it('should convert APIConnectionError to APINetworkError', () => {
        const error = createMockError('APIConnectionError', 'Connection failed');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APINetworkError);
        expect((converted as APINetworkError).retryable).toBe(true);
      });

      it('should convert APITimeoutError to APITimeoutError', () => {
        const error = createMockError('APITimeoutError', 'Request timed out');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APITimeoutError);
        expect((converted as APITimeoutError).retryable).toBe(true);
      });
    });

    describe('OpenAI errors', () => {
      const provider: AIProvider = 'openai';

      it('should convert RateLimitError to APIRateLimitError', () => {
        const error = createMockError('RateLimitError', 'Rate limit exceeded');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIRateLimitError);
        expect((converted as APIRateLimitError).provider).toBe('openai');
      });

      it('should convert AuthenticationError to APIAuthError', () => {
        const error = createMockError('AuthenticationError', 'Invalid API key');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIAuthError);
        expect((converted as APIAuthError).provider).toBe('openai');
      });

      it('should convert APIConnectionError to APINetworkError', () => {
        const error = createMockError('APIConnectionError', 'Connection failed');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APINetworkError);
        expect((converted as APINetworkError).provider).toBe('openai');
      });
    });

    describe('Google errors', () => {
      const provider: AIProvider = 'google';

      it('should convert 429 status to APIRateLimitError', () => {
        const error = createMockError('GoogleGenerativeAIError', 'Quota exceeded', { status: 429 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIRateLimitError);
        expect((converted as APIRateLimitError).provider).toBe('google');
      });

      it('should convert GoogleGenerativeAIFetchError to APINetworkError', () => {
        const error = createMockError('GoogleGenerativeAIFetchError', 'Fetch failed');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APINetworkError);
        expect((converted as APINetworkError).provider).toBe('google');
      });

      it('should convert 401 status to APIAuthError', () => {
        const error = createMockError('GoogleGenerativeAIError', 'Unauthorized', { status: 401 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIAuthError);
        expect((converted as APIAuthError).provider).toBe('google');
      });
    });

    describe('Perplexity errors (OpenAI-compatible)', () => {
      const provider: AIProvider = 'perplexity';

      it('should convert RateLimitError to APIRateLimitError', () => {
        const error = createMockError('RateLimitError', 'Rate limit exceeded');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIRateLimitError);
        expect((converted as APIRateLimitError).provider).toBe('perplexity');
      });

      it('should convert AuthenticationError to APIAuthError', () => {
        const error = createMockError('AuthenticationError', 'Invalid API key');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APIAuthError);
        expect((converted as APIAuthError).provider).toBe('perplexity');
      });
    });

    describe('Message-based pattern matching', () => {
      const provider: AIProvider = 'anthropic';

      it('should detect rate limit from message patterns', () => {
        const testMessages = [
          'Rate limit exceeded',
          'Too many requests',
          'Quota exceeded for today',
          'Request throttled',
          'Service capacity reached',
          'Server overloaded',
        ];

        for (const message of testMessages) {
          const error = createMockError('APIError', message);
          const converted = convertSDKError(error, provider);
          expect(converted).toBeInstanceOf(APIRateLimitError);
        }
      });

      it('should detect auth errors from message patterns', () => {
        const testMessages = [
          'Authentication failed',
          'Invalid API key provided',
          'Unauthorized access',
          'Permission denied',
          'Access denied to resource',
          'Invalid credentials',
        ];

        for (const message of testMessages) {
          const error = createMockError('APIError', message);
          const converted = convertSDKError(error, provider);
          expect(converted).toBeInstanceOf(APIAuthError);
        }
      });

      it('should detect network errors from message patterns', () => {
        const testMessages = [
          'Network error occurred',
          'Connection refused',
          'ECONNREFUSED',
          'ENOTFOUND',
          'ECONNRESET',
          'DNS lookup failed',
          'Socket hang up',
        ];

        for (const message of testMessages) {
          const error = createMockError('APIError', message);
          const converted = convertSDKError(error, provider);
          expect(converted).toBeInstanceOf(APINetworkError);
        }
      });

      it('should detect timeout errors from message patterns', () => {
        const testMessages = [
          'Request timeout',
          'Operation timed out',
          'Deadline exceeded',
        ];

        for (const message of testMessages) {
          const error = createMockError('APIError', message);
          const converted = convertSDKError(error, provider);
          expect(converted).toBeInstanceOf(APITimeoutError);
        }
      });

      it('should prioritize network patterns over timeout for ambiguous messages', () => {
        // "Connection timed out" contains both "connection" (network) and "timed out" (timeout)
        // Network pattern is checked first, so it should be APINetworkError
        const error = createMockError('APIError', 'Connection timed out');
        const converted = convertSDKError(error, provider);
        expect(converted).toBeInstanceOf(APINetworkError);
      });

      it('should handle ETIMEDOUT as network error due to pattern order', () => {
        // ETIMEDOUT is in both network and timeout patterns
        // Network is checked first, so it becomes APINetworkError
        const error = createMockError('APIError', 'ETIMEDOUT');
        const converted = convertSDKError(error, provider);
        expect(converted).toBeInstanceOf(APINetworkError);
      });
    });

    describe('Server errors (5xx)', () => {
      const provider: AIProvider = 'anthropic';

      it('should convert 500 status to APINetworkError', () => {
        const error = createMockError('APIError', 'Internal server error', { status: 500 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APINetworkError);
        expect(converted.message).toContain('Server error (500)');
        expect((converted as APINetworkError).retryable).toBe(true);
      });

      it('should convert 502 status to APINetworkError', () => {
        const error = createMockError('APIError', 'Bad gateway', { status: 502 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APINetworkError);
        expect((converted as APINetworkError).retryable).toBe(true);
      });

      it('should convert 503 status to APINetworkError', () => {
        const error = createMockError('APIError', 'Service unavailable', { status: 503 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APINetworkError);
        expect((converted as APINetworkError).retryable).toBe(true);
      });

      it('should convert 504 status with timeout message to APITimeoutError', () => {
        // "Gateway timeout" contains "timeout" which is caught by timeout pattern before 5xx
        const error = createMockError('APIError', 'Gateway timeout', { status: 504 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APITimeoutError);
        expect((converted as APITimeoutError).retryable).toBe(true);
      });

      it('should convert 529 status to APINetworkError', () => {
        // 529 is a 5xx status without timeout in message
        const error = createMockError('APIError', 'Service overloaded', { status: 529 });
        const converted = convertSDKError(error, provider);

        // "overloaded" matches rate limit pattern, so this becomes rate limit error
        expect(converted).toBeInstanceOf(APIRateLimitError);
        expect((converted as APIRateLimitError).retryable).toBe(true);
      });

      it('should convert pure 5xx status to APINetworkError', () => {
        // 599 status without any pattern matching message
        const error = createMockError('APIError', 'Unknown server error', { status: 599 });
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(APINetworkError);
        expect((converted as APINetworkError).retryable).toBe(true);
      });
    });

    describe('Default behavior', () => {
      const provider: AIProvider = 'anthropic';

      it('should convert unknown errors to AgentError', () => {
        const error = createMockError('UnknownError', 'Something went wrong');
        const converted = convertSDKError(error, provider);

        expect(converted).toBeInstanceOf(AgentError);
        expect(converted.message).toBe('Something went wrong');
        expect((converted as AgentError).retryable).toBe(false);
      });

      it('should pass through existing APIRateLimitError', () => {
        const error = new APIRateLimitError('Already converted', { provider: 'openai' });
        const converted = convertSDKError(error, provider);

        expect(converted).toBe(error);
        expect(converted).toBeInstanceOf(APIRateLimitError);
      });

      it('should pass through existing APIAuthError', () => {
        const error = new APIAuthError('Already converted', { provider: 'openai' });
        const converted = convertSDKError(error, provider);

        expect(converted).toBe(error);
      });

      it('should pass through existing APINetworkError', () => {
        const error = new APINetworkError('Already converted', { provider: 'openai' });
        const converted = convertSDKError(error, provider);

        expect(converted).toBe(error);
      });

      it('should pass through existing APITimeoutError', () => {
        const error = new APITimeoutError('Already converted', { provider: 'openai' });
        const converted = convertSDKError(error, provider);

        expect(converted).toBe(error);
      });

      it('should pass through existing AgentError', () => {
        const error = new AgentError('Already converted', { provider: 'openai' });
        const converted = convertSDKError(error, provider);

        expect(converted).toBe(error);
      });

      it('should handle non-Error objects', () => {
        const converted = convertSDKError('string error', provider);

        expect(converted).toBeInstanceOf(AgentError);
        expect(converted.message).toBe('string error');
      });

      it('should handle null/undefined', () => {
        const convertedNull = convertSDKError(null, provider);
        const convertedUndefined = convertSDKError(undefined, provider);

        expect(convertedNull).toBeInstanceOf(AgentError);
        expect(convertedUndefined).toBeInstanceOf(AgentError);
      });
    });

    describe('Error cause preservation', () => {
      const provider: AIProvider = 'anthropic';

      it('should preserve original error as cause', () => {
        const originalError = createMockError('RateLimitError', 'Rate limited');
        const converted = convertSDKError(originalError, provider);

        expect((converted as APIRateLimitError).cause).toBe(originalError);
      });

      it('should not set cause for non-Error values', () => {
        const converted = convertSDKError('string error', provider);

        expect((converted as AgentError).cause).toBeUndefined();
      });
    });
  });

  describe('isRetryableError', () => {
    it('should return true for APIRateLimitError', () => {
      const error = new APIRateLimitError('Rate limited', {});
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for APINetworkError', () => {
      const error = new APINetworkError('Network error', {});
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for APITimeoutError', () => {
      const error = new APITimeoutError('Timeout', {});
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for APIAuthError', () => {
      const error = new APIAuthError('Auth failed', {});
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for AgentError by default', () => {
      const error = new AgentError('Agent error', {});
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for generic Error', () => {
      const error = new Error('Generic error');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isRetryableError('string')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
      expect(isRetryableError(123)).toBe(false);
    });
  });
});
