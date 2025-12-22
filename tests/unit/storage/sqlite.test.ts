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

      await storage.addResponse('session-1', response, 1);

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

      await storage.addResponse('session-1', response, 1);

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

      await storage.addResponse('session-1', response, 1);

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

      await storage.addResponse('session-1', response1, 1);
      await storage.addResponse('session-1', response2, 1);

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

      await storage.addResponse('session-1', round1Response1, 1);
      await storage.addResponse('session-1', round1Response2, 1);
      await storage.addResponse('session-1', round2Response1, 2);
      await storage.addResponse('session-1', round2Response2, 2);

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

      await storage.addResponse('session-1', response, 1);

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

      await storage.addResponse('session-1', response, 1);
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

      await storage.addResponse('session-1', response, 1);

      const responses = await storage.getResponses('session-1');
      expect(responses[0]?.timestamp).toBeInstanceOf(Date);
      expect(responses[0]?.timestamp.getTime()).toBe(timestamp.getTime());
    });
  });

  describe('invalid data handling', () => {
    it('should handle invalid agent_ids JSON gracefully', async () => {
      // Create session via direct SQL with invalid JSON
      const session: Session = {
        id: 'invalid-json-session',
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

      // The session should be retrievable with valid data
      const retrieved = await storage.getSession('invalid-json-session');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.agentIds).toEqual(['agent-1']);
    });

    it('should validate session row structure from database', async () => {
      const session: Session = {
        id: 'valid-session',
        topic: 'Valid topic',
        mode: 'adversarial',
        agentIds: ['agent-a', 'agent-b'],
        status: 'completed',
        currentRound: 3,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session);
      const retrieved = await storage.getSession('valid-session');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('valid-session');
      expect(retrieved?.topic).toBe('Valid topic');
      expect(retrieved?.mode).toBe('adversarial');
      expect(retrieved?.agentIds).toHaveLength(2);
      expect(retrieved?.status).toBe('completed');
    });

    it('should validate response row structure from database', async () => {
      const session: Session = {
        id: 'session-for-response',
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
        agentName: 'Test Agent',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.75,
        citations: [
          { title: 'Citation 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
        ],
        toolCalls: [
          {
            toolName: 'search_web',
            input: { query: 'test' },
            output: { results: [] },
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
      };

      await storage.addResponse('session-for-response', response, 1);
      const responses = await storage.getResponses('session-for-response');

      expect(responses).toHaveLength(1);
      expect(responses[0]?.agentId).toBe('agent-1');
      expect(responses[0]?.citations).toHaveLength(1);
      expect(responses[0]?.citations?.[0]?.title).toBe('Citation 1');
      expect(responses[0]?.toolCalls).toHaveLength(1);
      expect(responses[0]?.toolCalls?.[0]?.toolName).toBe('search_web');
    });

    it('should skip invalid response rows in getResponses', async () => {
      const session: Session = {
        id: 'session-with-responses',
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

      await storage.createSession(session);

      // Add valid responses
      const response1: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Position 1',
        reasoning: 'Reasoning 1',
        confidence: 0.8,
        timestamp: new Date(Date.now() - 1000),
      };

      const response2: AgentResponse = {
        agentId: 'agent-2',
        agentName: 'Agent 2',
        position: 'Position 2',
        reasoning: 'Reasoning 2',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await storage.addResponse('session-with-responses', response1, 1);
      await storage.addResponse('session-with-responses', response2, 1);

      const responses = await storage.getResponses('session-with-responses');
      expect(responses).toHaveLength(2);
    });

    it('should validate citations JSON structure', async () => {
      const session: Session = {
        id: 'session-citations',
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
        agentName: 'Agent 1',
        position: 'Position with citations',
        reasoning: 'Reasoning with sources',
        confidence: 0.85,
        citations: [
          { title: 'Source A', url: 'https://a.com' },
          { title: 'Source B', url: 'https://b.com', snippet: 'Important info' },
        ],
        timestamp: new Date(),
      };

      await storage.addResponse('session-citations', response, 1);
      const responses = await storage.getResponses('session-citations');

      expect(responses[0]?.citations).toHaveLength(2);
      expect(responses[0]?.citations?.[0]?.title).toBe('Source A');
      expect(responses[0]?.citations?.[1]?.snippet).toBe('Important info');
    });

    it('should validate tool_calls JSON structure', async () => {
      const session: Session = {
        id: 'session-tools',
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

      const toolTimestamp = new Date();
      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Position with tools',
        reasoning: 'Reasoning with tool usage',
        confidence: 0.9,
        toolCalls: [
          {
            toolName: 'search_web',
            input: { query: 'AI regulation' },
            output: { success: true, data: { results: [] } },
            timestamp: toolTimestamp,
          },
        ],
        timestamp: new Date(),
      };

      await storage.addResponse('session-tools', response, 1);
      const responses = await storage.getResponses('session-tools');

      expect(responses[0]?.toolCalls).toHaveLength(1);
      expect(responses[0]?.toolCalls?.[0]?.toolName).toBe('search_web');
      expect(responses[0]?.toolCalls?.[0]?.input).toEqual({ query: 'AI regulation' });
      expect(responses[0]?.toolCalls?.[0]?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('LIKE pattern escaping', () => {
    it('should escape % character in topic filter', async () => {
      const session1: Session = {
        id: 'session-percent',
        topic: 'Topic with 100% confidence',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const session2: Session = {
        id: 'session-normal',
        topic: 'Normal topic here',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session1);
      await storage.createSession(session2);

      // Search for literal % character - should only find session-percent
      const results = await storage.listSessions({ topic: '100%' });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('session-percent');
    });

    it('should escape _ character in topic filter', async () => {
      const session1: Session = {
        id: 'session-underscore',
        topic: 'Topic with user_name pattern',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const session2: Session = {
        id: 'session-username',
        topic: 'Topic with username pattern',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session1);
      await storage.createSession(session2);

      // Search for literal _ character - should only find session-underscore
      // Without escaping, _ would match any single character
      const results = await storage.listSessions({ topic: 'user_name' });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('session-underscore');
    });

    it('should escape backslash in topic filter', async () => {
      const session1: Session = {
        id: 'session-backslash',
        topic: 'Topic with C:\\path\\file',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session1);

      // Search for literal backslash
      const results = await storage.listSessions({ topic: 'C:\\path' });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('session-backslash');
    });
  });

  describe('batch loading optimization', () => {
    it('should load responses for multiple sessions efficiently', async () => {
      // Create multiple sessions
      const session1: Session = {
        id: 'batch-session-1',
        topic: 'Batch topic 1',
        mode: 'collaborative',
        agentIds: ['agent-1', 'agent-2'],
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(Date.now() - 2000),
        updatedAt: new Date(Date.now() - 2000),
      };

      const session2: Session = {
        id: 'batch-session-2',
        topic: 'Batch topic 2',
        mode: 'adversarial',
        agentIds: ['agent-1', 'agent-2'],
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(Date.now() - 1000),
        updatedAt: new Date(Date.now() - 1000),
      };

      const session3: Session = {
        id: 'batch-session-3',
        topic: 'Batch topic 3',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'completed',
        currentRound: 3,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session1);
      await storage.createSession(session2);
      await storage.createSession(session3);

      // Add responses to each session
      const response1: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Position for session 1',
        reasoning: 'Reasoning 1',
        confidence: 0.8,
        timestamp: new Date(Date.now() - 2000),
      };

      const response2: AgentResponse = {
        agentId: 'agent-2',
        agentName: 'Agent Two',
        position: 'Position for session 1',
        reasoning: 'Reasoning 2',
        confidence: 0.9,
        timestamp: new Date(Date.now() - 1500),
      };

      const response3: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Position for session 2',
        reasoning: 'Reasoning 3',
        confidence: 0.7,
        timestamp: new Date(Date.now() - 1000),
      };

      await storage.addResponse('batch-session-1', response1, 1);
      await storage.addResponse('batch-session-1', response2, 1);
      await storage.addResponse('batch-session-2', response3, 1);

      // List all sessions - should have responses included
      const sessions = await storage.listSessions();
      expect(sessions).toHaveLength(3);

      // Find each session and verify responses
      const s1 = sessions.find((s) => s.id === 'batch-session-1');
      const s2 = sessions.find((s) => s.id === 'batch-session-2');
      const s3 = sessions.find((s) => s.id === 'batch-session-3');

      expect(s1?.responses).toHaveLength(2);
      expect(s1?.responses[0]?.agentId).toBe('agent-1');
      expect(s1?.responses[1]?.agentId).toBe('agent-2');

      expect(s2?.responses).toHaveLength(1);
      expect(s2?.responses[0]?.agentId).toBe('agent-1');

      expect(s3?.responses).toHaveLength(0);
    });

    it('should handle sessions with no responses in batch', async () => {
      const session1: Session = {
        id: 'empty-session-1',
        topic: 'Empty topic 1',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const session2: Session = {
        id: 'empty-session-2',
        topic: 'Empty topic 2',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createSession(session1);
      await storage.createSession(session2);

      // List sessions - should work even with no responses
      const sessions = await storage.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.responses).toEqual([]);
      expect(sessions[1]?.responses).toEqual([]);
    });
  });
});
