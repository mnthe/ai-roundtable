/**
 * Session Data Provider - Adapter for SessionManager to provide debate evidence
 *
 * Implements SessionDataProvider interface to bridge SessionManager with
 * the fact_check tool's debate evidence requirements.
 */

import type { SessionDataProvider } from '../toolkit.js';
import type { SessionManager } from '../../core/session-manager.js';

/**
 * Adapter that wraps SessionManager to provide debate evidence for fact checking.
 *
 * This adapter follows the Adapter pattern to decouple the toolkit's
 * SessionDataProvider interface from the concrete SessionManager implementation.
 *
 * @example
 * ```typescript
 * const sessionManager = new SessionManager();
 * const adapter = new SessionManagerAdapter(sessionManager);
 * const toolkit = new DefaultAgentToolkit(adapter);
 * ```
 */
export class SessionManagerAdapter implements SessionDataProvider {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Get all debate evidence from a session for fact checking.
   *
   * Retrieves all agent responses from the session and transforms them
   * to the evidence format expected by the fact_check tool.
   *
   * @param sessionId - The session ID to retrieve evidence from
   * @returns Array of evidence from all agents in the session
   */
  async getDebateEvidence(sessionId: string): Promise<
    Array<{
      agentId: string;
      agentName: string;
      position: string;
      reasoning: string;
      confidence: number;
    }>
  > {
    const responses = await this.sessionManager.getResponses(sessionId);

    return responses.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      position: r.position,
      reasoning: r.reasoning,
      confidence: r.confidence,
    }));
  }
}

/**
 * Create a SessionManagerAdapter from a SessionManager instance
 */
export function createSessionManagerAdapter(
  sessionManager: SessionManager
): SessionDataProvider {
  return new SessionManagerAdapter(sessionManager);
}
