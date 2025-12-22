/**
 * Error handling utilities for MCP handlers
 */

/**
 * Wrap unknown error as Error object
 * Safely converts unknown catch errors without unsafe casts
 */
export function wrapError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(String(error));
}
