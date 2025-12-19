/**
 * Session management for debate rounds
 */

import type { Session, AgentResponse, SessionStatus, DebateConfig } from '../types/index.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { randomUUID } from 'crypto';

export interface SessionManagerOptions {
  storage?: SQLiteStorage;
  storageFilename?: string;
}

export class SessionManager {
  private storage: SQLiteStorage;
  private ownsStorage: boolean;

  constructor(options: SessionManagerOptions = {}) {
    if (options.storage) {
      this.storage = options.storage;
      this.ownsStorage = false;
    } else {
      this.storage = new SQLiteStorage({ filename: options.storageFilename });
      this.ownsStorage = true;
    }
  }

  /**
   * Create a new debate session
   */
  createSession(config: DebateConfig): Session {
    const now = new Date();
    const session: Session = {
      id: randomUUID(),
      topic: config.topic,
      mode: config.mode,
      agentIds: config.agents,
      status: 'active',
      currentRound: 0,
      totalRounds: config.rounds || 3,
      responses: [],
      createdAt: now,
      updatedAt: now,
    };

    this.storage.createSession(session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.storage.getSession(sessionId);
  }

  /**
   * Update session status
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): void {
    this.storage.updateSession(sessionId, { status });
  }

  /**
   * Update session round
   */
  updateSessionRound(sessionId: string, round: number): void {
    this.storage.updateSession(sessionId, { currentRound: round });
  }

  /**
   * Add a response to a session
   */
  addResponse(sessionId: string, response: AgentResponse): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.storage.addResponse(sessionId, response);
  }

  /**
   * Get all responses for a session
   */
  getResponses(sessionId: string): AgentResponse[] {
    return this.storage.getResponses(sessionId);
  }

  /**
   * Get responses for a specific round
   */
  getResponsesForRound(sessionId: string, round: number): AgentResponse[] {
    return this.storage.getResponsesForRound(sessionId, round);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.storage.deleteSession(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): Session[] {
    return this.storage.listSessions();
  }

  /**
   * Close the session manager and storage
   */
  close(): void {
    if (this.ownsStorage) {
      this.storage.close();
    }
  }
}
