/**
 * Session management for debate rounds
 */

import { randomUUID } from 'crypto';
import { SessionError } from '../errors/index.js';
import { SQLiteStorage, type Storage } from '../storage/index.js';
import type { Session, AgentResponse, SessionStatus, DebateConfig } from '../types/index.js';

export interface SessionManagerOptions {
  /** Provide a custom storage implementation */
  storage?: Storage;
  /** Filename for SQLite storage (ignored if storage is provided) */
  storageFilename?: string;
}

export class SessionManager {
  private storage: Storage;
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
  async createSession(config: DebateConfig): Promise<Session> {
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
      flags: config.flags,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.createSession(session);
    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return this.storage.getSession(sessionId);
  }

  /**
   * Update session status
   */
  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    await this.storage.updateSession(sessionId, { status });
  }

  /**
   * Update session round
   */
  async updateSessionRound(sessionId: string, round: number): Promise<void> {
    await this.storage.updateSession(sessionId, { currentRound: round });
  }

  /**
   * Add a response to a session
   * @param roundNumber - The round number this response belongs to
   */
  async addResponse(sessionId: string, response: AgentResponse, roundNumber: number): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new SessionError(`Session ${sessionId} not found`, {
        code: 'SESSION_NOT_FOUND',
      });
    }

    await this.storage.addResponse(sessionId, response, roundNumber);
  }

  /**
   * Get all responses for a session
   */
  async getResponses(sessionId: string): Promise<AgentResponse[]> {
    return this.storage.getResponses(sessionId);
  }

  /**
   * Get responses for a specific round
   */
  async getResponsesForRound(sessionId: string, round: number): Promise<AgentResponse[]> {
    return this.storage.getResponsesForRound(sessionId, round);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.storage.deleteSession(sessionId);
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<Session[]> {
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
