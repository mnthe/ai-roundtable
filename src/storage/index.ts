/**
 * Storage module exports
 */

import type { Session, AgentResponse } from '../types/index.js';
import type { SessionFilter } from './sqlite.js';

/**
 * Storage interface for session and response persistence
 *
 * Implement this interface to create custom storage backends
 * (e.g., PostgreSQL, Redis, in-memory for testing)
 */
export interface Storage {
  /** Create a new session */
  createSession(session: Session): Promise<void>;

  /** Get a session by ID */
  getSession(sessionId: string): Promise<Session | null>;

  /** Update session properties */
  updateSession(sessionId: string, updates: Partial<Session>): Promise<void>;

  /** Delete a session and its responses */
  deleteSession(sessionId: string): Promise<void>;

  /** List sessions with optional filters */
  listSessions(filters?: SessionFilter): Promise<Session[]>;

  /** Add a response to a session
   * @param roundNumber - The round number this response belongs to (required for accurate round queries)
   */
  addResponse(sessionId: string, response: AgentResponse, roundNumber: number): Promise<void>;

  /** Get all responses for a session */
  getResponses(sessionId: string): Promise<AgentResponse[]>;

  /** Get responses for a specific round */
  getResponsesForRound(sessionId: string, round: number): Promise<AgentResponse[]>;

  /** Close the storage connection */
  close(): void;
}

export { SQLiteStorage } from './sqlite.js';
export type { SQLiteStorageOptions, StoredSession, StoredResponse, SessionFilter } from './sqlite.js';
