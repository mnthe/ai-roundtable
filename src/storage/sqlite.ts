/**
 * SQLite storage implementation for sessions and responses
 * Uses sql.js (pure JavaScript/WebAssembly) for cross-platform compatibility
 */

import initSqlJs from 'sql.js';
import type { SqlJsStatic, Database as SqlJsDatabase } from 'sql.js';
import type {
  Session,
  AgentResponse,
  SessionStatus,
  DebateMode,
  Citation,
  ToolCallRecord,
} from '../types/index.js';

export interface SQLiteStorageOptions {
  filename?: string; // Use ':memory:' for in-memory database (default)
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

// Global SQL.js instance (initialized once)
let sqlJsInstance: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsInstance) {
    sqlJsInstance = await initSqlJs();
  }
  return sqlJsInstance;
}

export class SQLiteStorage {
  private db: SqlJsDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(_options: SQLiteStorageOptions = {}) {
    // Initialize asynchronously
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    const SQL = await getSqlJs();
    this.db = new SQL.Database();
    this.initializeSchema();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  private getDb(): SqlJsDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call ensureInitialized() first.');
    }
    return this.db;
  }

  private initializeSchema(): void {
    const db = this.getDb();

    // Create sessions table
    db.run(`
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
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)`);

    // Create responses table
    db.run(`
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
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_responses_session_id ON responses(session_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_responses_timestamp ON responses(timestamp)`);
  }

  /**
   * Create a new session
   */
  async createSession(session: Session): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();

    db.run(
      `INSERT INTO sessions (id, topic, mode, agent_ids, status, current_round, total_rounds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.topic,
        session.mode,
        JSON.stringify(session.agentIds),
        session.status,
        session.currentRound,
        session.totalRounds,
        session.createdAt.getTime(),
        session.updatedAt.getTime(),
      ]
    );
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    await this.ensureInitialized();
    const db = this.getDb();

    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    stmt.bind([sessionId]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as unknown as StoredSession;
    stmt.free();

    return this.mapStoredSessionToSession(row);
  }

  /**
   * Update a session
   */
  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();

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
    db.run(sql, values as (string | number | null)[]);
  }

  /**
   * Delete a session and its responses
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();

    // Delete responses first (manual cascade for sql.js)
    db.run('DELETE FROM responses WHERE session_id = ?', [sessionId]);
    db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<Session[]> {
    await this.ensureInitialized();
    const db = this.getDb();

    const results: Session[] = [];
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');

    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as StoredSession;
      results.push(await this.mapStoredSessionToSession(row));
    }
    stmt.free();

    return results;
  }

  /**
   * Add a response to a session
   */
  async addResponse(sessionId: string, response: AgentResponse): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();

    // Use timestamp + random suffix to ensure uniqueness even for rapid calls
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const id = `${sessionId}-${response.agentId}-${response.timestamp.getTime()}-${randomSuffix}`;

    db.run(
      `INSERT INTO responses (id, session_id, agent_id, agent_name, position, reasoning, confidence, citations, tool_calls, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sessionId,
        response.agentId,
        response.agentName,
        response.position,
        response.reasoning,
        response.confidence,
        response.citations ? JSON.stringify(response.citations) : null,
        response.toolCalls ? JSON.stringify(response.toolCalls) : null,
        response.timestamp.getTime(),
      ]
    );
  }

  /**
   * Get all responses for a session
   */
  async getResponses(sessionId: string): Promise<AgentResponse[]> {
    await this.ensureInitialized();
    const db = this.getDb();

    const results: AgentResponse[] = [];
    const stmt = db.prepare('SELECT * FROM responses WHERE session_id = ? ORDER BY timestamp ASC');
    stmt.bind([sessionId]);

    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as StoredResponse;
      results.push(this.mapStoredResponseToAgentResponse(row));
    }
    stmt.free();

    return results;
  }

  /**
   * Get responses for a specific round
   */
  async getResponsesForRound(sessionId: string, round: number): Promise<AgentResponse[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }

    const allResponses = await this.getResponses(sessionId);
    const responsesPerRound = session.agentIds.length;
    const startIndex = (round - 1) * responsesPerRound;
    const endIndex = startIndex + responsesPerRound;

    return allResponses.slice(startIndex, endIndex);
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Map stored session to Session type
   */
  private async mapStoredSessionToSession(stored: StoredSession): Promise<Session> {
    const responses = await this.getResponses(stored.id);
    return {
      id: stored.id,
      topic: stored.topic,
      mode: stored.mode as DebateMode,
      agentIds: JSON.parse(stored.agent_ids) as string[],
      status: stored.status as SessionStatus,
      currentRound: stored.current_round,
      totalRounds: stored.total_rounds,
      responses,
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
