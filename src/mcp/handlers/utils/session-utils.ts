/**
 * Session utility functions for MCP handlers
 */

import type { SessionManager } from '../../../core/session-manager.js';
import type { Session } from '../../../types/index.js';
import { createErrorResponse, type ToolResponse } from '../../tools.js';

/**
 * Get session or return error response
 * Centralizes session existence check across all handlers
 */
export async function getSessionOrError(
  sessionManager: SessionManager,
  sessionId: string
): Promise<{ session: Session } | { error: ToolResponse }> {
  const session = await sessionManager.getSession(sessionId);
  if (!session) {
    return { error: createErrorResponse(`Session "${sessionId}" not found`) };
  }
  return { session };
}

/**
 * Type guard to check if result is an error
 */
export function isSessionError(
  result: { session: Session } | { error: ToolResponse }
): result is { error: ToolResponse } {
  return 'error' in result;
}
