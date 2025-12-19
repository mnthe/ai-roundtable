import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../../../src/storage/sqlite.js';
import type { Session, AgentResponse } from '../../../src/types/index.js';

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;

  beforeEach(() => {
    // Use in-memory database for tests
    storage = new SQLiteStorage({ filename: ':memory:' });
  });

  afterEach(() => {
    storage.close();
  });

  describe('session operations', () => {
    it('should create a session', async () => {
      const session: Session = {
        id: 'session-1',
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agentIds: ['agent-1', 'agent-2'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session);

      const retrieved = await storage.getSession('session-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('session-1');
      expect(retrieved?.topic).toBe('Should AI be regulated?');
      expect(retrieved?.mode).toBe('collaborative');
      expect(retrieved?.agentIds).toEqual(['agent-1', 'agent-2']);
      expect(retrieved?.status).toBe('active');
      expect(retrieved?.currentRound).toBe(0);
      expect(retrieved?.totalRounds).toBe(3);
    });

    it('should return null for non-existent session', async () => {
      const retrieved = await storage.getSession('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update a session', async () => {
      const session: Session = {
        id: 'session-1',
        topic: 'Original topic',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session);

      await storage.updateSession('session-1', {
        status: 'completed',
        currentRound: 3,
      });

      const retrieved = await storage.getSession('session-1');
      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.currentRound).toBe(3);
    });

    it('should update only specified fields', async () => {
      const session: Session = {
        id: 'session-1',
        topic: 'Original topic',
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

      await storage.updateSession('session-1', {
        status: 'paused',
      });

      const retrieved = await storage.getSession('session-1');
      expect(retrieved?.status).toBe('paused');
      expect(retrieved?.currentRound).toBe(1); // Should remain unchanged
      expect(retrieved?.topic).toBe('Original topic'); // Should remain unchanged
    });

    it('should delete a session', async () => {
      const session: Session = {
        id: 'session-1',
        topic: 'Test topic',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session);
      expect(await storage.getSession('session-1')).not.toBeNull();

      await storage.deleteSession('session-1');
      expect(await storage.getSession('session-1')).toBeNull();
    });

    it('should list all sessions', async () => {
      const session1: Session = {
        id: 'session-1',
        topic: 'Topic 1',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(Date.now() - 1000),
        updatedAt: new Date(Date.now() - 1000),
      };

      const session2: Session = {
        id: 'session-2',
        topic: 'Topic 2',
        mode: 'adversarial',
        agentIds: ['agent-2'],
        status: 'completed',
        currentRound: 3,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session1);
      await storage.createSession(session2);

      const sessions = await storage.listSessions();
      expect(sessions).toHaveLength(2);
      // Should be ordered by created_at DESC
      expect(sessions[0]?.id).toBe('session-2');
      expect(sessions[1]?.id).toBe('session-1');
    });
  });

  describe('response operations', () => {
    const session: Session = {
      id: 'session-1',
      topic: 'Test topic',
      mode: 'collaborative',
      agentIds: ['agent-1', 'agent-2'],
      status: 'active',
      currentRound: 1,
      totalRounds: 3,
      responses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(async () => {
      await storage.createSession(session);
    });

    it('should add a response', async () => {
      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Yes, AI should be regulated',
        reasoning: 'Safety is paramount',
        confidence: 0.85,
        timestamp: new Date(),
      };

      await storage.addResponse('session-1', response);

      const responses = await storage.getResponses('session-1');
      expect(responses).toHaveLength(1);
      expect(responses[0]?.agentId).toBe('agent-1');
      expect(responses[0]?.position).toBe('Yes, AI should be regulated');
      expect(responses[0]?.confidence).toBe(0.85);
    });

    it('should add a response with citations', async () => {
      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
        citations: [
          {
            title: 'AI Research Paper',
            url: 'https://example.com/paper',
            snippet: 'Important findings',
          },
        ],
        timestamp: new Date(),
      };

      await storage.addResponse('session-1', response);

      const responses = await storage.getResponses('session-1');
      expect(responses[0]?.citations).toHaveLength(1);
      expect(responses[0]?.citations?.[0]?.title).toBe('AI Research Paper');
    });

    it('should add a response with tool calls', async () => {
      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
        toolCalls: [
          {
            toolName: 'search_web',
            input: { query: 'AI regulation' },
            output: { results: [] },
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
      };

      await storage.addResponse('session-1', response);

      const responses = await storage.getResponses('session-1');
      expect(responses[0]?.toolCalls).toHaveLength(1);
      expect(responses[0]?.toolCalls?.[0]?.toolName).toBe('search_web');
    });

    it('should get all responses for a session', async () => {
      const response1: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Position 1',
        reasoning: 'Reasoning 1',
        confidence: 0.8,
        timestamp: new Date(Date.now() - 1000),
      };

      const response2: AgentResponse = {
        agentId: 'agent-2',
        agentName: 'Agent Two',
        position: 'Position 2',
        reasoning: 'Reasoning 2',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await storage.addResponse('session-1', response1);
      await storage.addResponse('session-1', response2);

      const responses = await storage.getResponses('session-1');
      expect(responses).toHaveLength(2);
      // Should be ordered by timestamp ASC
      expect(responses[0]?.agentId).toBe('agent-1');
      expect(responses[1]?.agentId).toBe('agent-2');
    });

    it('should get responses for a specific round', async () => {
      // Round 1: 2 responses
      const round1Response1: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Round 1 Position 1',
        reasoning: 'Reasoning',
        confidence: 0.8,
        timestamp: new Date(Date.now() - 3000),
      };

      const round1Response2: AgentResponse = {
        agentId: 'agent-2',
        agentName: 'Agent Two',
        position: 'Round 1 Position 2',
        reasoning: 'Reasoning',
        confidence: 0.9,
        timestamp: new Date(Date.now() - 2000),
      };

      // Round 2: 2 responses
      const round2Response1: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Round 2 Position 1',
        reasoning: 'Reasoning',
        confidence: 0.85,
        timestamp: new Date(Date.now() - 1000),
      };

      const round2Response2: AgentResponse = {
        agentId: 'agent-2',
        agentName: 'Agent Two',
        position: 'Round 2 Position 2',
        reasoning: 'Reasoning',
        confidence: 0.95,
        timestamp: new Date(),
      };

      await storage.addResponse('session-1', round1Response1);
      await storage.addResponse('session-1', round1Response2);
      await storage.addResponse('session-1', round2Response1);
      await storage.addResponse('session-1', round2Response2);

      const round1Responses = await storage.getResponsesForRound('session-1', 1);
      expect(round1Responses).toHaveLength(2);
      expect(round1Responses[0]?.position).toBe('Round 1 Position 1');
      expect(round1Responses[1]?.position).toBe('Round 1 Position 2');

      const round2Responses = await storage.getResponsesForRound('session-1', 2);
      expect(round2Responses).toHaveLength(2);
      expect(round2Responses[0]?.position).toBe('Round 2 Position 1');
      expect(round2Responses[1]?.position).toBe('Round 2 Position 2');
    });

    it('should return empty array for non-existent session responses', async () => {
      const responses = await storage.getResponses('non-existent');
      expect(responses).toEqual([]);
    });

    it('should return empty array for non-existent session round', async () => {
      const responses = await storage.getResponsesForRound('non-existent', 1);
      expect(responses).toEqual([]);
    });
  });

  describe('session with responses integration', () => {
    it('should include responses when getting session', async () => {
      const session: Session = {
        id: 'session-1',
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

      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await storage.addResponse('session-1', response);

      const retrieved = await storage.getSession('session-1');
      expect(retrieved?.responses).toHaveLength(1);
      expect(retrieved?.responses[0]?.agentId).toBe('agent-1');
    });

    it('should delete responses when session is deleted', async () => {
      const session: Session = {
        id: 'session-1',
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

      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await storage.addResponse('session-1', response);
      expect((await storage.getResponses('session-1')).length).toBe(1);

      await storage.deleteSession('session-1');
      expect((await storage.getResponses('session-1')).length).toBe(0);
    });
  });

  describe('data persistence', () => {
    it('should preserve date types', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const updatedAt = new Date('2024-01-02T00:00:00Z');

      const session: Session = {
        id: 'session-1',
        topic: 'Test topic',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt,
        updatedAt,
      };

      await storage.createSession(session);

      const retrieved = await storage.getSession('session-1');
      expect(retrieved?.createdAt).toBeInstanceOf(Date);
      expect(retrieved?.updatedAt).toBeInstanceOf(Date);
      expect(retrieved?.createdAt.getTime()).toBe(createdAt.getTime());
      expect(retrieved?.updatedAt.getTime()).toBe(updatedAt.getTime());
    });

    it('should preserve response timestamps', async () => {
      const session: Session = {
        id: 'session-1',
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

      const timestamp = new Date('2024-01-01T12:00:00Z');
      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
        timestamp,
      };

      await storage.addResponse('session-1', response);

      const responses = await storage.getResponses('session-1');
      expect(responses[0]?.timestamp).toBeInstanceOf(Date);
      expect(responses[0]?.timestamp.getTime()).toBe(timestamp.getTime());
    });
  });
});
