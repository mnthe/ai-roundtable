/**
 * SDK Error Converter - Converts provider-specific SDK errors to custom error types
 *
 * This module provides a unified error conversion mechanism that transforms
 * errors from various AI SDK providers (Anthropic, OpenAI, Google) into
 * standardized RoundtableError types.
 */

import {
  APIRateLimitError,
  APIAuthError,
  APINetworkError,
  APITimeoutError,
  AgentError,
} from '../../errors/index.js';
import type { AIProvider } from '../../types/index.js';

/**
 * Error pattern definitions for each SDK
 * These patterns are used to identify the type of error from each provider
 */
interface ErrorPattern {
  /** Check if the error matches this pattern */
  matches: (error: unknown) => boolean;
  /** Convert the error to a custom error type */
  convert: (error: unknown, provider: AIProvider) => Error;
}

/**
 * Helper to extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Helper to get error code/status from error object
 */
function getErrorCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const anyError = error as { status?: number; code?: number | string; statusCode?: number };
    return (
      anyError.status ?? anyError.statusCode ?? (typeof anyError.code === 'number' ? anyError.code : undefined)
    );
  }
  return undefined;
}

/**
 * Helper to get error name
 */
function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return '';
}

/**
 * Check if error message contains rate limit indicators
 */
function isRateLimitMessage(message: string): boolean {
  const rateLimitPatterns = [
    /rate.?limit/i,
    /too.?many.?requests/i,
    /quota.?exceeded/i,
    /throttl/i,
    /capacity/i,
    /overloaded/i,
  ];
  return rateLimitPatterns.some((pattern) => pattern.test(message));
}

/**
 * Check if error message contains authentication indicators
 */
function isAuthMessage(message: string): boolean {
  const authPatterns = [
    /auth/i,
    /api.?key/i,
    /invalid.?key/i,
    /unauthorized/i,
    /forbidden/i,
    /permission/i,
    /access.?denied/i,
    /credential/i,
  ];
  return authPatterns.some((pattern) => pattern.test(message));
}

/**
 * Check if error message contains network/connection indicators
 */
function isNetworkMessage(message: string): boolean {
  const networkPatterns = [
    /network/i,
    /connection/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /fetch.?error/i,
    /socket/i,
    /dns/i,
  ];
  return networkPatterns.some((pattern) => pattern.test(message));
}

/**
 * Check if error message contains timeout indicators
 */
function isTimeoutMessage(message: string): boolean {
  const timeoutPatterns = [/timeout/i, /timed.?out/i, /deadline/i, /ETIMEDOUT/i];
  return timeoutPatterns.some((pattern) => pattern.test(message));
}

/**
 * Error patterns for Anthropic SDK
 *
 * Anthropic SDK throws errors with specific names:
 * - RateLimitError: Rate limit exceeded (429)
 * - AuthenticationError: Invalid API key (401)
 * - PermissionDeniedError: Permission denied (403)
 * - APIConnectionError: Network/connection issues
 * - InternalServerError: Server-side errors (5xx)
 * - APIError: Generic API errors
 */
const anthropicPatterns: ErrorPattern[] = [
  {
    matches: (error) => getErrorName(error) === 'RateLimitError' || getErrorCode(error) === 429,
    convert: (error, provider) =>
      new APIRateLimitError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorName(error) === 'AuthenticationError' ||
      getErrorName(error) === 'PermissionDeniedError' ||
      getErrorCode(error) === 401 ||
      getErrorCode(error) === 403,
    convert: (error, provider) =>
      new APIAuthError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorName(error) === 'APIConnectionError' || isNetworkMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APINetworkError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorName(error) === 'APITimeoutError' || isTimeoutMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APITimeoutError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
];

/**
 * Error patterns for OpenAI SDK (also used by Perplexity)
 *
 * OpenAI SDK throws errors with specific names:
 * - RateLimitError: Rate limit exceeded (429)
 * - AuthenticationError: Invalid API key (401)
 * - PermissionDeniedError: Permission denied (403)
 * - APIConnectionError: Network/connection issues
 * - InternalServerError: Server-side errors (5xx)
 * - APIError: Generic API errors
 */
const openaiPatterns: ErrorPattern[] = [
  {
    matches: (error) => getErrorName(error) === 'RateLimitError' || getErrorCode(error) === 429,
    convert: (error, provider) =>
      new APIRateLimitError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorName(error) === 'AuthenticationError' ||
      getErrorName(error) === 'PermissionDeniedError' ||
      getErrorCode(error) === 401 ||
      getErrorCode(error) === 403,
    convert: (error, provider) =>
      new APIAuthError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorName(error) === 'APIConnectionError' || isNetworkMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APINetworkError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) => isTimeoutMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APITimeoutError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
];

/**
 * Error patterns for Google Gen AI SDK
 *
 * Google Gen AI SDK throws errors with specific names:
 * - GoogleGenerativeAIError: Generic SDK error
 * - GoogleGenerativeAIFetchError: Network/fetch errors
 * - GoogleGenerativeAIResponseError: Server-side errors (includes status codes)
 */
const googlePatterns: ErrorPattern[] = [
  {
    matches: (error) => getErrorCode(error) === 429 || isRateLimitMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APIRateLimitError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorCode(error) === 401 ||
      getErrorCode(error) === 403 ||
      isAuthMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APIAuthError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorName(error) === 'GoogleGenerativeAIFetchError' ||
      isNetworkMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APINetworkError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) => isTimeoutMessage(getErrorMessage(error)),
    convert: (error, provider) =>
      new APITimeoutError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
];

/**
 * Provider-specific error patterns
 */
const providerPatterns: Record<AIProvider, ErrorPattern[]> = {
  anthropic: anthropicPatterns,
  openai: openaiPatterns,
  google: googlePatterns,
  perplexity: openaiPatterns, // Perplexity uses OpenAI-compatible SDK
};

/**
 * Convert SDK-specific errors to custom RoundtableError types
 *
 * This function examines the error from each SDK and converts it to the
 * appropriate custom error type based on the error's characteristics
 * (name, status code, message patterns).
 *
 * @param error - The original error from the SDK
 * @param provider - The AI provider (anthropic, openai, google, perplexity)
 * @returns A custom RoundtableError subclass or AgentError for unknown errors
 *
 * @example
 * ```typescript
 * try {
 *   await client.messages.create(...);
 * } catch (error) {
 *   throw convertSDKError(error, 'anthropic');
 * }
 * ```
 */
export function convertSDKError(error: unknown, provider: AIProvider): Error {
  // If it's already a RoundtableError, return as-is
  if (
    error instanceof APIRateLimitError ||
    error instanceof APIAuthError ||
    error instanceof APINetworkError ||
    error instanceof APITimeoutError ||
    error instanceof AgentError
  ) {
    return error;
  }

  const patterns = providerPatterns[provider];
  const message = getErrorMessage(error);

  // Try provider-specific patterns first
  for (const pattern of patterns) {
    if (pattern.matches(error)) {
      return pattern.convert(error, provider);
    }
  }

  // Generic fallback patterns based on message content
  if (isRateLimitMessage(message)) {
    return new APIRateLimitError(message, {
      provider,
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (isAuthMessage(message)) {
    return new APIAuthError(message, {
      provider,
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (isNetworkMessage(message)) {
    return new APINetworkError(message, {
      provider,
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (isTimeoutMessage(message)) {
    return new APITimeoutError(message, {
      provider,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Server errors (5xx)
  const code = getErrorCode(error);
  if (code && code >= 500 && code < 600) {
    return new APINetworkError(`Server error (${code}): ${message}`, {
      provider,
      retryable: true,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Default: wrap in AgentError
  return new AgentError(message, {
    provider,
    retryable: false,
    cause: error instanceof Error ? error : undefined,
  });
}

/**
 * Type guard to check if an error is a retryable RoundtableError
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof APIRateLimitError) return true;
  if (error instanceof APINetworkError) return true;
  if (error instanceof APITimeoutError) return true;
  return false;
}
