/**
 * Custom Error classes for AI Roundtable
 */

export interface ErrorOptions {
  code: string;
  provider?: string;
  retryable?: boolean;
  cause?: Error;
}

/**
 * Base error class for all Roundtable errors
 */
export class RoundtableError extends Error {
  public readonly code: string;
  public readonly provider?: string;
  public readonly retryable: boolean;
  public override readonly cause?: Error;

  constructor(message: string, options: ErrorOptions) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      provider: this.provider,
      retryable: this.retryable,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

/**
 * API rate limit exceeded error
 */
export class APIRateLimitError extends RoundtableError {
  constructor(
    message: string = 'API rate limit exceeded',
    options: Omit<ErrorOptions, 'code' | 'retryable'> & Partial<Pick<ErrorOptions, 'code' | 'retryable'>>
  ) {
    super(message, {
      code: options.code ?? 'API_RATE_LIMIT',
      provider: options.provider,
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
  }
}

/**
 * API authentication failure error
 */
export class APIAuthError extends RoundtableError {
  constructor(
    message: string = 'API authentication failed',
    options: Omit<ErrorOptions, 'code' | 'retryable'> & Partial<Pick<ErrorOptions, 'code' | 'retryable'>>
  ) {
    super(message, {
      code: options.code ?? 'API_AUTH_FAILED',
      provider: options.provider,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
  }
}

/**
 * Network error
 */
export class APINetworkError extends RoundtableError {
  constructor(
    message: string = 'Network error occurred',
    options: Omit<ErrorOptions, 'code' | 'retryable'> & Partial<Pick<ErrorOptions, 'code' | 'retryable'>>
  ) {
    super(message, {
      code: options.code ?? 'API_NETWORK_ERROR',
      provider: options.provider,
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
  }
}

/**
 * API timeout error
 */
export class APITimeoutError extends RoundtableError {
  constructor(
    message: string = 'API request timed out',
    options: Omit<ErrorOptions, 'code' | 'retryable'> & Partial<Pick<ErrorOptions, 'code' | 'retryable'>>
  ) {
    super(message, {
      code: options.code ?? 'API_TIMEOUT',
      provider: options.provider,
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
  }
}

/**
 * Agent execution error
 */
export class AgentError extends RoundtableError {
  constructor(
    message: string,
    options: Omit<ErrorOptions, 'code'> & Partial<Pick<ErrorOptions, 'code'>>
  ) {
    super(message, {
      code: options.code ?? 'AGENT_ERROR',
      provider: options.provider,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
  }
}

/**
 * Session-related error
 */
export class SessionError extends RoundtableError {
  constructor(
    message: string,
    options: Omit<ErrorOptions, 'code'> & Partial<Pick<ErrorOptions, 'code'>>
  ) {
    super(message, {
      code: options.code ?? 'SESSION_ERROR',
      provider: options.provider,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
  }
}

/**
 * Storage-related error (database operations, data validation)
 */
export class StorageError extends RoundtableError {
  constructor(
    message: string,
    options: Omit<ErrorOptions, 'code'> & Partial<Pick<ErrorOptions, 'code'>>
  ) {
    super(message, {
      code: options.code ?? 'STORAGE_ERROR',
      provider: options.provider,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
  }
}

/**
 * Configuration/initialization error
 */
export class ConfigurationError extends RoundtableError {
  constructor(
    message: string,
    options: Omit<ErrorOptions, 'code'> & Partial<Pick<ErrorOptions, 'code'>>
  ) {
    super(message, {
      code: options.code ?? 'CONFIGURATION_ERROR',
      provider: options.provider,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
  }
}
