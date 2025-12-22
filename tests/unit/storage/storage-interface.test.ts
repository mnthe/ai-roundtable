/**
 * Tests for Storage interface abstraction
 *
 * Verifies that SessionManager works with any Storage implementation,
 * not just SQLiteStorage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../../../src/core/session-manager.js';
import type { Storage } from '../../../src/storage/index.js';
import type { Session, AgentResponse } from '../../../src/types/index.js';

/**
 * Mock Storage implementation for testing
 *
 * Demonstrates that any class implementing the Storage interface
 * can be used with SessionManager.
 */
class MockStorage implements Storage {
  private sessions: Map<string, Session> = new Map();
  private responses: Map<string, AgentResponse[]> = new Map();

  async createSession(session: Session): Promise<void> {
    this.sessions.set(session.id, { ...session });
    this.responses.set(session.id, []);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const responses = this.responses.get(sessionId) ?? [];
    return { ...session, responses };
  }

  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    this.sessions.set(sessionId, { ...session, ...updates, updatedAt: new Date() });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.responses.delete(sessionId);
  }

  async listSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values()).map((session) => ({
      ...session,
      responses: this.responses.get(session.id) ?? [],
    }));
  }

  async addResponse(
    sessionId: string,
    response: AgentResponse,
    roundNumber: number
  ): Promise<void> {
    const responses = this.responses.get(sessionId);
    if (!responses) throw new Error(`Session ${sessionId} not found`);

    responses.push({ ...response, roundNumber });
  }

  async getResponses(sessionId: string): Promise<AgentResponse[]> {
    return this.responses.get(sessionId) ?? [];
  }

  async getResponsesForRound(sessionId: string, round: number): Promise<AgentResponse[]> {
    const responses = this.responses.get(sessionId) ?? [];
    // Filter by round number (stored when addResponse is called)
    return responses.filter((r: any) => r.roundNumber === round);
  }

  close(): void {
    this.sessions.clear();
    this.responses.clear();
  }
}

describe('Storage Interface', () => {
  describe('MockStorage implementation', () => {
    let storage: MockStorage;

    beforeEach(() => {
      storage = new MockStorage();
    });

    it('should implement all Storage interface methods', () => {
      // Verify MockStorage has all required methods
      expect(typeof storage.createSession).toBe('function');
      expect(typeof storage.getSession).toBe('function');
      expect(typeof storage.updateSession).toBe('function');
      expect(typeof storage.deleteSession).toBe('function');
      expect(typeof storage.listSessions).toBe('function');
      expect(typeof storage.addResponse).toBe('function');
      expect(typeof storage.getResponses).toBe('function');
      expect(typeof storage.getResponsesForRound).toBe('function');
      expect(typeof storage.close).toBe('function');
    });

    it('should store and retrieve sessions', async () => {
      const session: Session = {
        id: 'test-session',
        topic: 'Test topic',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session);
      const retrieved = await storage.getSession('test-session');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-session');
      expect(retrieved?.topic).toBe('Test topic');
    });
  });

  describe('SessionManager with custom Storage', () => {
    let mockStorage: MockStorage;
    let sessionManager: SessionManager;

    beforeEach(() => {
      mockStorage = new MockStorage();
      sessionManager = new SessionManager({ storage: mockStorage });
    });

    it('should create session using custom storage', async () => {
      const session = await sessionManager.createSession({
        topic: 'Test debate',
        mode: 'adversarial',
        agents: ['agent-1', 'agent-2'],
        rounds: 5,
      });

      expect(session.topic).toBe('Test debate');
      expect(session.mode).toBe('adversarial');
      expect(session.agentIds).toEqual(['agent-1', 'agent-2']);
      expect(session.totalRounds).toBe(5);
      expect(session.status).toBe('active');

      // Verify it was stored in mock storage
      const retrieved = await mockStorage.getSession(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(session.id);
    });

    it('should get session from custom storage', async () => {
      const created = await sessionManager.createSession({
        topic: 'Another test',
        mode: 'collaborative',
        agents: ['agent-1'],
      });

      const retrieved = await sessionManager.getSession(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.topic).toBe('Another test');
    });

    it('should update session status in custom storage', async () => {
      const session = await sessionManager.createSession({
        topic: 'Status test',
        mode: 'socratic',
        agents: ['agent-1'],
      });

      await sessionManager.updateSessionStatus(session.id, 'paused');

      const retrieved = await sessionManager.getSession(session.id);
      expect(retrieved?.status).toBe('paused');
    });

    it('should update session round in custom storage', async () => {
      const session = await sessionManager.createSession({
        topic: 'Round test',
        mode: 'delphi',
        agents: ['agent-1'],
      });

      await sessionManager.updateSessionRound(session.id, 2);

      const retrieved = await sessionManager.getSession(session.id);
      expect(retrieved?.currentRound).toBe(2);
    });

    it('should add and retrieve responses from custom storage', async () => {
      const session = await sessionManager.createSession({
        topic: 'Response test',
        mode: 'expert-panel',
        agents: ['agent-1'],
      });

      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Test Agent',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await sessionManager.addResponse(session.id, response, 1);

      const responses = await sessionManager.getResponses(session.id);
      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('agent-1');
      expect(responses[0].position).toBe('Test position');
    });

    it('should list sessions from custom storage', async () => {
      await sessionManager.createSession({
        topic: 'Session 1',
        mode: 'collaborative',
        agents: ['agent-1'],
      });

      await sessionManager.createSession({
        topic: 'Session 2',
        mode: 'adversarial',
        agents: ['agent-2'],
      });

      const sessions = await sessionManager.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should delete session from custom storage', async () => {
      const session = await sessionManager.createSession({
        topic: 'Delete test',
        mode: 'collaborative',
        agents: ['agent-1'],
      });

      await sessionManager.deleteSession(session.id);

      const retrieved = await sessionManager.getSession(session.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error when adding response to non-existent session', async () => {
      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Test Agent',
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.5,
        timestamp: new Date(),
      };

      await expect(sessionManager.addResponse('non-existent', response, 1)).rejects.toThrow(
        'Session non-existent not found'
      );
    });
  });

  describe('SessionManager ownership', () => {
    it('should not close storage when not owned', () => {
      const mockStorage = new MockStorage();
      const closeSpy = vi.spyOn(mockStorage, 'close');

      const sessionManager = new SessionManager({ storage: mockStorage });
      sessionManager.close();

      // Should NOT call close on injected storage
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });
});
