/**
 * SQLite storage implementation for sessions and responses
 * Uses sql.js (pure JavaScript/WebAssembly) for cross-platform compatibility
 */

import initSqlJs from 'sql.js';
import type { SqlJsStatic, Database as SqlJsDatabase } from 'sql.js';
import { ZodError } from 'zod';
import { StorageError } from '../errors/index.js';
import {
  StoredSessionRowSchema,
  StoredResponseRowSchema,
  AgentIdsArraySchema,
  StoredCitationsArraySchema,
  StoredToolCallsArraySchema,
} from '../types/schemas.js';
import type {
  Session,
  AgentResponse,
  SessionStatus,
  DebateMode,
  Citation,
  ToolCallRecord,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import type { Storage } from './index.js';

const logger = createLogger('SQLiteStorage');

export interface SQLiteStorageOptions {
  filename?: string; // Use ':memory:' for in-memory database (default)
}

/**
 * Session filter options for search
 */
export interface SessionFilter {
  topic?: string;           // Search by topic keyword
  mode?: DebateMode;        // Filter by debate mode
  status?: SessionStatus;   // Filter by session status
  fromDate?: Date;          // Filter sessions created after this date
  toDate?: Date;            // Filter sessions created before this date
  limit?: number;           // Maximum number of results
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
  round_number: number;
  agent_id: string;
  agent_name: string;
  stance: string | null; // 'YES' | 'NO' | 'NEUTRAL' | null
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

export class SQLiteStorage implements Storage {
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
      throw new StorageError('Database not initialized. Call ensureInitialized() first.', {
        code: 'DB_NOT_INITIALIZED',
      });
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
        round_number INTEGER NOT NULL DEFAULT 1,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        stance TEXT,
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
    db.run(`CREATE INDEX IF NOT EXISTS idx_responses_session_round ON responses(session_id, round_number)`);
  }

  /**
   * Create a new session
   */
  async createSession(session: Session): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();

    logger.debug(
      {
        sessionId: session.id,
        topic: session.topic,
        mode: session.mode,
        agentCount: session.agentIds.length,
      },
      'Creating session in database'
    );

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

    logger.debug({ sessionId: session.id }, 'Session created successfully');
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

    const rawRow = stmt.getAsObject();
    stmt.free();

    try {
      const row = StoredSessionRowSchema.parse(rawRow) as StoredSession;
      return this.mapStoredSessionToSession(row);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error(
          { sessionId, error: error.issues },
          'Invalid session data in database'
        );
        throw new StorageError(`Invalid session data for ${sessionId}: ${error.message}`, {
          code: 'INVALID_SESSION_DATA',
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Update a session
   */
  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();

    logger.debug(
      { sessionId, updates: Object.keys(updates) },
      'Updating session in database'
    );

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
      logger.debug({ sessionId }, 'No fields to update');
      return;
    }

    values.push(sessionId);

    const sql = `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`;
    db.run(sql, values as (string | number | null)[]);

    logger.debug({ sessionId }, 'Session updated successfully');
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
   * Session filter options for search
   */
  /**
   * List sessions with optional filters
   */
  async listSessions(filters?: SessionFilter): Promise<Session[]> {
    await this.ensureInitialized();
    const db = this.getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.topic) {
      conditions.push('topic LIKE ?');
      params.push(`%${filters.topic}%`);
    }

    if (filters?.mode) {
      conditions.push('mode = ?');
      params.push(filters.mode);
    }

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters?.fromDate) {
      conditions.push('created_at >= ?');
      params.push(filters.fromDate.getTime());
    }

    if (filters?.toDate) {
      conditions.push('created_at <= ?');
      params.push(filters.toDate.getTime());
    }

    let sql = 'SELECT * FROM sessions';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const results: Session[] = [];
    const stmt = db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }

    while (stmt.step()) {
      const rawRow = stmt.getAsObject();
      try {
        const row = StoredSessionRowSchema.parse(rawRow) as StoredSession;
        results.push(await this.mapStoredSessionToSession(row));
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn(
            { rawRow, error: error.issues },
            'Skipping invalid session row in listSessions'
          );
          continue;
        }
        throw error;
      }
    }
    stmt.free();

    return results;
  }

  /**
   * Add a response to a session
   */
  async addResponse(sessionId: string, response: AgentResponse, roundNumber: number): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();

    logger.debug(
      {
        sessionId,
        roundNumber,
        agentId: response.agentId,
        agentName: response.agentName,
        confidence: response.confidence,
      },
      'Adding response to database'
    );

    // Use timestamp + random suffix to ensure uniqueness even for rapid calls
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const id = `${sessionId}-${response.agentId}-${response.timestamp.getTime()}-${randomSuffix}`;

    db.run(
      `INSERT INTO responses (id, session_id, round_number, agent_id, agent_name, stance, position, reasoning, confidence, citations, tool_calls, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sessionId,
        roundNumber,
        response.agentId,
        response.agentName,
        response.stance ?? null,
        response.position,
        response.reasoning,
        response.confidence,
        response.citations ? JSON.stringify(response.citations) : null,
        response.toolCalls ? JSON.stringify(response.toolCalls) : null,
        response.timestamp.getTime(),
      ]
    );

    logger.debug({ sessionId, roundNumber, responseId: id }, 'Response added successfully');
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
      const rawRow = stmt.getAsObject();
      try {
        const row = StoredResponseRowSchema.parse(rawRow) as StoredResponse;
        results.push(this.mapStoredResponseToAgentResponse(row));
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn(
            { sessionId, rawRow, error: error.issues },
            'Skipping invalid response row in getResponses'
          );
          continue;
        }
        throw error;
      }
    }
    stmt.free();

    return results;
  }

  /**
   * Get responses for a specific round
   */
  async getResponsesForRound(sessionId: string, round: number): Promise<AgentResponse[]> {
    await this.ensureInitialized();
    const db = this.getDb();

    const results: AgentResponse[] = [];
    const stmt = db.prepare(
      'SELECT * FROM responses WHERE session_id = ? AND round_number = ? ORDER BY timestamp ASC'
    );
    stmt.bind([sessionId, round]);

    while (stmt.step()) {
      const rawRow = stmt.getAsObject();
      try {
        const row = StoredResponseRowSchema.parse(rawRow) as StoredResponse;
        results.push(this.mapStoredResponseToAgentResponse(row));
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn(
            { sessionId, round, rawRow, error: error.issues },
            'Skipping invalid response row in getResponsesForRound'
          );
          continue;
        }
        throw error;
      }
    }
    stmt.free();

    return results;
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

    // Parse and validate agent_ids JSON
    let agentIds: string[];
    try {
      const parsed = JSON.parse(stored.agent_ids);
      agentIds = AgentIdsArraySchema.parse(parsed);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error(
          { sessionId: stored.id, agent_ids: stored.agent_ids, error: error.issues },
          'Invalid agent_ids JSON in session'
        );
        throw new StorageError(`Invalid agent_ids for session ${stored.id}: ${error.message}`, {
          code: 'INVALID_AGENT_IDS',
          cause: error,
        });
      }
      throw error;
    }

    return {
      id: stored.id,
      topic: stored.topic,
      mode: stored.mode,
      agentIds,
      status: stored.status,
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
    // Parse and validate citations JSON
    let citations: Citation[] | undefined;
    if (stored.citations) {
      try {
        const parsed = JSON.parse(stored.citations);
        citations = StoredCitationsArraySchema.parse(parsed);
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn(
            { responseId: stored.id, citations: stored.citations, error: error.issues },
            'Invalid citations JSON in response, skipping citations'
          );
          citations = undefined;
        } else {
          throw error;
        }
      }
    }

    // Parse and validate tool_calls JSON
    let toolCalls: ToolCallRecord[] | undefined;
    if (stored.tool_calls) {
      try {
        const parsed = JSON.parse(stored.tool_calls);
        const validated = StoredToolCallsArraySchema.parse(parsed);
        // Convert timestamp to Date if needed
        toolCalls = validated.map((tc) => ({
          ...tc,
          timestamp: tc.timestamp instanceof Date ? tc.timestamp : new Date(tc.timestamp as string | number),
        }));
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn(
            { responseId: stored.id, tool_calls: stored.tool_calls, error: error.issues },
            'Invalid tool_calls JSON in response, skipping tool calls'
          );
          toolCalls = undefined;
        } else {
          throw error;
        }
      }
    }

    // Parse stance (validate it's one of the allowed values)
    const validStances = ['YES', 'NO', 'NEUTRAL'] as const;
    const stance = stored.stance && validStances.includes(stored.stance as (typeof validStances)[number])
      ? (stored.stance as 'YES' | 'NO' | 'NEUTRAL')
      : undefined;

    return {
      agentId: stored.agent_id,
      agentName: stored.agent_name,
      stance,
      position: stored.position,
      reasoning: stored.reasoning,
      confidence: stored.confidence,
      citations,
      toolCalls,
      timestamp: new Date(stored.timestamp),
    };
  }
}
