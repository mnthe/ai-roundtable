import { describe, it, expect } from 'vitest';
import {
  RoundtableError,
  APIRateLimitError,
  APIAuthError,
  APINetworkError,
  APITimeoutError,
  AgentError,
  SessionError,
} from '../../../src/errors/index.js';

describe('Error Classes', () => {
  describe('RoundtableError', () => {
    it('should create basic error with required fields', () => {
      const error = new RoundtableError('Test error', {
        code: 'TEST_ERROR',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RoundtableError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('RoundtableError');
      expect(error.retryable).toBe(false);
    });

    it('should create error with all fields', () => {
      const cause = new Error('Original error');
      const error = new RoundtableError('Test error', {
        code: 'TEST_ERROR',
        provider: 'test-provider',
        retryable: true,
        cause,
      });

      expect(error.code).toBe('TEST_ERROR');
      expect(error.provider).toBe('test-provider');
      expect(error.retryable).toBe(true);
      expect(error.cause).toBe(cause);
    });

    it('should have proper stack trace', () => {
      const error = new RoundtableError('Test error', {
        code: 'TEST_ERROR',
      });

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('RoundtableError');
    });

    it('should serialize to JSON', () => {
      const cause = new Error('Original error');
      const error = new RoundtableError('Test error', {
        code: 'TEST_ERROR',
        provider: 'test-provider',
        retryable: true,
        cause,
      });

      const json = error.toJSON();

      expect(json.name).toBe('RoundtableError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.provider).toBe('test-provider');
      expect(json.retryable).toBe(true);
      expect(json.cause).toBe('Original error');
      expect(json.stack).toBeDefined();
    });
  });

  describe('APIRateLimitError', () => {
    it('should create with default message and code', () => {
      const error = new APIRateLimitError('Rate limited', {});

      expect(error).toBeInstanceOf(RoundtableError);
      expect(error).toBeInstanceOf(APIRateLimitError);
      expect(error.message).toBe('Rate limited');
      expect(error.code).toBe('API_RATE_LIMIT');
      expect(error.name).toBe('APIRateLimitError');
      expect(error.retryable).toBe(true);
    });

    it('should be retryable by default', () => {
      const error = new APIRateLimitError('Rate limited', {
        provider: 'anthropic',
      });

      expect(error.retryable).toBe(true);
    });

    it('should allow custom code', () => {
      const error = new APIRateLimitError('Rate limited', {
        code: 'CUSTOM_RATE_LIMIT',
      });

      expect(error.code).toBe('CUSTOM_RATE_LIMIT');
    });

    it('should preserve cause', () => {
      const cause = new Error('429 Too Many Requests');
      const error = new APIRateLimitError('Rate limited', { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe('APIAuthError', () => {
    it('should create with default message and code', () => {
      const error = new APIAuthError('Auth failed', {});

      expect(error).toBeInstanceOf(RoundtableError);
      expect(error).toBeInstanceOf(APIAuthError);
      expect(error.message).toBe('Auth failed');
      expect(error.code).toBe('API_AUTH_FAILED');
      expect(error.name).toBe('APIAuthError');
      expect(error.retryable).toBe(false);
    });

    it('should not be retryable by default', () => {
      const error = new APIAuthError('Invalid API key', {
        provider: 'openai',
      });

      expect(error.retryable).toBe(false);
    });

    it('should allow override retryable', () => {
      const error = new APIAuthError('Auth failed', {
        retryable: true,
      });

      expect(error.retryable).toBe(true);
    });
  });

  describe('APINetworkError', () => {
    it('should create with default message and code', () => {
      const error = new APINetworkError('Network error', {});

      expect(error).toBeInstanceOf(RoundtableError);
      expect(error).toBeInstanceOf(APINetworkError);
      expect(error.message).toBe('Network error');
      expect(error.code).toBe('API_NETWORK_ERROR');
      expect(error.name).toBe('APINetworkError');
      expect(error.retryable).toBe(true);
    });

    it('should be retryable by default', () => {
      const error = new APINetworkError('Connection refused', {
        provider: 'anthropic',
      });

      expect(error.retryable).toBe(true);
    });
  });

  describe('APITimeoutError', () => {
    it('should create with default message and code', () => {
      const error = new APITimeoutError('Request timed out', {});

      expect(error).toBeInstanceOf(RoundtableError);
      expect(error).toBeInstanceOf(APITimeoutError);
      expect(error.message).toBe('Request timed out');
      expect(error.code).toBe('API_TIMEOUT');
      expect(error.name).toBe('APITimeoutError');
      expect(error.retryable).toBe(true);
    });

    it('should be retryable by default', () => {
      const error = new APITimeoutError('Timeout after 30s', {
        provider: 'openai',
      });

      expect(error.retryable).toBe(true);
    });
  });

  describe('AgentError', () => {
    it('should create with message and default code', () => {
      const error = new AgentError('Agent execution failed', {});

      expect(error).toBeInstanceOf(RoundtableError);
      expect(error).toBeInstanceOf(AgentError);
      expect(error.message).toBe('Agent execution failed');
      expect(error.code).toBe('AGENT_ERROR');
      expect(error.name).toBe('AgentError');
      expect(error.retryable).toBe(false);
    });

    it('should not be retryable by default', () => {
      const error = new AgentError('Agent crashed', {
        provider: 'claude',
      });

      expect(error.retryable).toBe(false);
    });

    it('should allow custom code and retryable', () => {
      const error = new AgentError('Agent temporary failure', {
        code: 'AGENT_TEMP_FAILURE',
        retryable: true,
        provider: 'openai',
      });

      expect(error.code).toBe('AGENT_TEMP_FAILURE');
      expect(error.retryable).toBe(true);
      expect(error.provider).toBe('openai');
    });
  });

  describe('SessionError', () => {
    it('should create with message and default code', () => {
      const error = new SessionError('Session not found', {});

      expect(error).toBeInstanceOf(RoundtableError);
      expect(error).toBeInstanceOf(SessionError);
      expect(error.message).toBe('Session not found');
      expect(error.code).toBe('SESSION_ERROR');
      expect(error.name).toBe('SessionError');
      expect(error.retryable).toBe(false);
    });

    it('should allow custom code', () => {
      const error = new SessionError('Session expired', {
        code: 'SESSION_EXPIRED',
      });

      expect(error.code).toBe('SESSION_EXPIRED');
    });

    it('should not be retryable by default', () => {
      const error = new SessionError('Invalid session state', {});

      expect(error.retryable).toBe(false);
    });
  });

  describe('Error inheritance', () => {
    it('should work with instanceof checks', () => {
      const rateLimitError = new APIRateLimitError('Rate limited', {});
      const authError = new APIAuthError('Auth failed', {});
      const networkError = new APINetworkError('Network error', {});
      const timeoutError = new APITimeoutError('Timeout', {});
      const agentError = new AgentError('Agent failed', {});
      const sessionError = new SessionError('Session error', {});

      // All should be instances of RoundtableError
      expect(rateLimitError).toBeInstanceOf(RoundtableError);
      expect(authError).toBeInstanceOf(RoundtableError);
      expect(networkError).toBeInstanceOf(RoundtableError);
      expect(timeoutError).toBeInstanceOf(RoundtableError);
      expect(agentError).toBeInstanceOf(RoundtableError);
      expect(sessionError).toBeInstanceOf(RoundtableError);

      // All should be instances of Error
      expect(rateLimitError).toBeInstanceOf(Error);
      expect(authError).toBeInstanceOf(Error);
      expect(networkError).toBeInstanceOf(Error);
      expect(timeoutError).toBeInstanceOf(Error);
      expect(agentError).toBeInstanceOf(Error);
      expect(sessionError).toBeInstanceOf(Error);
    });

    it('should not be instances of each other', () => {
      const rateLimitError = new APIRateLimitError('Rate limited', {});
      const authError = new APIAuthError('Auth failed', {});

      expect(rateLimitError).not.toBeInstanceOf(APIAuthError);
      expect(authError).not.toBeInstanceOf(APIRateLimitError);
    });
  });

  describe('Error catching', () => {
    it('should be catchable as RoundtableError', () => {
      try {
        throw new APIRateLimitError('Rate limited', { provider: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(RoundtableError);
        if (error instanceof RoundtableError) {
          expect(error.code).toBe('API_RATE_LIMIT');
          expect(error.provider).toBe('test');
          expect(error.retryable).toBe(true);
        }
      }
    });

    it('should be catchable as Error', () => {
      try {
        throw new AgentError('Agent failed', {});
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toBe('Agent failed');
        }
      }
    });
  });
});
