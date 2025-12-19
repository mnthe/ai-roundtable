/**
 * SQLite storage implementation for sessions and responses
 */

import Database from 'better-sqlite3';
import type {
  Session,
  AgentResponse,
  SessionStatus,
  DebateMode,
  Citation,
  ToolCallRecord,
} from '../types/index.js';

export interface SQLiteStorageOptions {
  filename?: string; // Use ':memory:' for in-memory database
  readonly?: boolean;
}

export interface StoredSession {
  id: string;
  topic: string;
  mode: DebateMode;
  agent_ids: string; // JSON array
  status: SessionStatus;
  current_round: number;
  total_rounds: number;
  created_at: number; // Unix timestamp
  updated_at: number; // Unix timestamp
}

export interface StoredResponse {
  id: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  position: string;
  reasoning: string;
  confidence: number;
  citations: string | null; // JSON array
  tool_calls: string | null; // JSON array
  timestamp: number; // Unix timestamp
}

export class SQLiteStorage {
  private db: Database.Database;

  constructor(options: SQLiteStorageOptions = {}) {
    const filename = options.filename || ':memory:';
    const dbOptions: { readonly?: boolean; fileMustExist?: boolean } = {
      fileMustExist: false,
    };
    if (options.readonly !== undefined) {
      dbOptions.readonly = options.readonly;
    }
    this.db = new Database(filename, dbOptions);

    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        mode TEXT NOT NULL,
        agent_ids TEXT NOT NULL,
        status TEXT NOT NULL,
        current_round INTEGER NOT NULL DEFAULT 0,
        total_rounds INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
    `);

    // Create responses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        position TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        confidence REAL NOT NULL,
        citations TEXT,
        tool_calls TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_responses_session_id ON responses(session_id);
      CREATE INDEX IF NOT EXISTS idx_responses_timestamp ON responses(timestamp);
    `);
  }

  /**
   * Create a new session
   */
  createSession(session: Session): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, topic, mode, agent_ids, status, current_round, total_rounds, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.topic,
      session.mode,
      JSON.stringify(session.agentIds),
      session.status,
      session.currentRound,
      session.totalRounds,
      session.createdAt.getTime(),
      session.updatedAt.getTime()
    );
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(sessionId) as StoredSession | undefined;

    if (!row) {
      return null;
    }

    return this.mapStoredSessionToSession(row);
  }

  /**
   * Update a session
   */
  updateSession(sessionId: string, updates: Partial<Session>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.topic !== undefined) {
      fields.push('topic = ?');
      values.push(updates.topic);
    }
    if (updates.mode !== undefined) {
      fields.push('mode = ?');
      values.push(updates.mode);
    }
    if (updates.agentIds !== undefined) {
      fields.push('agent_ids = ?');
      values.push(JSON.stringify(updates.agentIds));
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.currentRound !== undefined) {
      fields.push('current_round = ?');
      values.push(updates.currentRound);
    }
    if (updates.totalRounds !== undefined) {
      fields.push('total_rounds = ?');
      values.push(updates.totalRounds);
    }

    // Always update updated_at
    fields.push('updated_at = ?');
    values.push(Date.now());

    if (fields.length === 1) {
      // Only updated_at field, nothing else to update
      return;
    }

    values.push(sessionId);

    const sql = `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  /**
   * Delete a session and its responses
   */
  deleteSession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');
    const rows = stmt.all() as StoredSession[];

    return rows.map((row) => this.mapStoredSessionToSession(row));
  }

  /**
   * Add a response to a session
   */
  addResponse(sessionId: string, response: AgentResponse): void {
    // Use timestamp + random suffix to ensure uniqueness even for rapid calls
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const id = `${sessionId}-${response.agentId}-${response.timestamp.getTime()}-${randomSuffix}`;

    const stmt = this.db.prepare(`
      INSERT INTO responses (id, session_id, agent_id, agent_name, position, reasoning, confidence, citations, tool_calls, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      sessionId,
      response.agentId,
      response.agentName,
      response.position,
      response.reasoning,
      response.confidence,
      response.citations ? JSON.stringify(response.citations) : null,
      response.toolCalls ? JSON.stringify(response.toolCalls) : null,
      response.timestamp.getTime()
    );
  }

  /**
   * Get all responses for a session
   */
  getResponses(sessionId: string): AgentResponse[] {
    const stmt = this.db.prepare('SELECT * FROM responses WHERE session_id = ? ORDER BY timestamp ASC');
    const rows = stmt.all(sessionId) as StoredResponse[];

    return rows.map((row) => this.mapStoredResponseToAgentResponse(row));
  }

  /**
   * Get responses for a specific round
   */
  getResponsesForRound(sessionId: string, round: number): AgentResponse[] {
    const session = this.getSession(sessionId);
    if (!session) {
      return [];
    }

    const allResponses = this.getResponses(sessionId);
    const responsesPerRound = session.agentIds.length;
    const startIndex = (round - 1) * responsesPerRound;
    const endIndex = startIndex + responsesPerRound;

    return allResponses.slice(startIndex, endIndex);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Map stored session to Session type
   */
  private mapStoredSessionToSession(stored: StoredSession): Session {
    return {
      id: stored.id,
      topic: stored.topic,
      mode: stored.mode,
      agentIds: JSON.parse(stored.agent_ids) as string[],
      status: stored.status,
      currentRound: stored.current_round,
      totalRounds: stored.total_rounds,
      responses: this.getResponses(stored.id),
      createdAt: new Date(stored.created_at),
      updatedAt: new Date(stored.updated_at),
    };
  }

  /**
   * Map stored response to AgentResponse type
   */
  private mapStoredResponseToAgentResponse(stored: StoredResponse): AgentResponse {
    return {
      agentId: stored.agent_id,
      agentName: stored.agent_name,
      position: stored.position,
      reasoning: stored.reasoning,
      confidence: stored.confidence,
      citations: stored.citations ? (JSON.parse(stored.citations) as Citation[]) : undefined,
      toolCalls: stored.tool_calls ? (JSON.parse(stored.tool_calls) as ToolCallRecord[]) : undefined,
      timestamp: new Date(stored.timestamp),
    };
  }
}
