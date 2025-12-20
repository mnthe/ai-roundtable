import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../../src/core/session-manager.js';
import { SQLiteStorage } from '../../../src/storage/sqlite.js';
import type { DebateConfig, AgentResponse } from '../../../src/types/index.js';

describe('SessionManager', () => {
  let manager: SessionManager;
  let storage: SQLiteStorage;

  beforeEach(() => {
    // Use in-memory database for tests
    storage = new SQLiteStorage({ filename: ':memory:' });
    manager = new SessionManager({ storage });
  });

  afterEach(() => {
    manager.close();
    storage.close();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const config: DebateConfig = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agents: ['agent-1', 'agent-2'],
        rounds: 3,
      };

      const session = await manager.createSession(config);

      expect(session.id).toBeDefined();
      expect(session.topic).toBe('Should AI be regulated?');
      expect(session.mode).toBe('collaborative');
      expect(session.agentIds).toEqual(['agent-1', 'agent-2']);
      expect(session.status).toBe('active');
      expect(session.currentRound).toBe(0);
      expect(session.totalRounds).toBe(3);
      expect(session.responses).toEqual([]);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
    });

    it('should use default rounds if not specified', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'adversarial',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);

      expect(session.totalRounds).toBe(3);
    });

    it('should generate unique session IDs', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session1 = await manager.createSession(config);
      const session2 = await manager.createSession(config);

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const created = await manager.createSession(config);
      const retrieved = await manager.getSession(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.topic).toBe('Test topic');
    });

    it('should return null for non-existent session', async () => {
      const retrieved = await manager.getSession('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);
      expect(session.status).toBe('active');

      await manager.updateSessionStatus(session.id, 'completed');

      const retrieved = await manager.getSession(session.id);
      expect(retrieved?.status).toBe('completed');
    });

    it('should update to paused status', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);
      await manager.updateSessionStatus(session.id, 'paused');

      const retrieved = await manager.getSession(session.id);
      expect(retrieved?.status).toBe('paused');
    });

    it('should update to error status', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);
      await manager.updateSessionStatus(session.id, 'error');

      const retrieved = await manager.getSession(session.id);
      expect(retrieved?.status).toBe('error');
    });
  });

  describe('updateSessionRound', () => {
    it('should update current round', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);
      expect(session.currentRound).toBe(0);

      await manager.updateSessionRound(session.id, 1);

      const retrieved = await manager.getSession(session.id);
      expect(retrieved?.currentRound).toBe(1);
    });

    it('should update to multiple rounds', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
        rounds: 5,
      };

      const session = await manager.createSession(config);

      await manager.updateSessionRound(session.id, 3);
      let retrieved = await manager.getSession(session.id);
      expect(retrieved?.currentRound).toBe(3);

      await manager.updateSessionRound(session.id, 5);
      retrieved = await manager.getSession(session.id);
      expect(retrieved?.currentRound).toBe(5);
    });
  });

  describe('addResponse', () => {
    it('should add a response to a session', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);

      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Yes, AI should be regulated',
        reasoning: 'Safety is paramount',
        confidence: 0.85,
        timestamp: new Date(),
      };

      await manager.addResponse(session.id, response, 1);

      const retrieved = await manager.getSession(session.id);
      expect(retrieved?.responses).toHaveLength(1);
      expect(retrieved?.responses[0]?.agentId).toBe('agent-1');
      expect(retrieved?.responses[0]?.position).toBe('Yes, AI should be regulated');
    });

    it('should add multiple responses', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1', 'agent-2'],
      };

      const session = await manager.createSession(config);

      const response1: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Position 1',
        reasoning: 'Reasoning 1',
        confidence: 0.8,
        timestamp: new Date(),
      };

      const response2: AgentResponse = {
        agentId: 'agent-2',
        agentName: 'Agent Two',
        position: 'Position 2',
        reasoning: 'Reasoning 2',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await manager.addResponse(session.id, response1, 1);
      await manager.addResponse(session.id, response2, 1);

      const retrieved = await manager.getSession(session.id);
      expect(retrieved?.responses).toHaveLength(2);
    });

    it('should throw error for non-existent session', async () => {
      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await expect(manager.addResponse('non-existent-id', response)).rejects.toThrow(
        'Session non-existent-id not found'
      );
    });
  });

  describe('getResponses', () => {
    it('should get all responses for a session', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1', 'agent-2'],
      };

      const session = await manager.createSession(config);

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

      await manager.addResponse(session.id, response1, 1);
      await manager.addResponse(session.id, response2, 1);

      const responses = await manager.getResponses(session.id);
      expect(responses).toHaveLength(2);
      expect(responses[0]?.agentId).toBe('agent-1');
      expect(responses[1]?.agentId).toBe('agent-2');
    });

    it('should return empty array for session with no responses', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);
      const responses = await manager.getResponses(session.id);

      expect(responses).toEqual([]);
    });

    it('should return empty array for non-existent session', async () => {
      const responses = await manager.getResponses('non-existent-id');
      expect(responses).toEqual([]);
    });
  });

  describe('getResponsesForRound', () => {
    it('should get responses for a specific round', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1', 'agent-2'],
        rounds: 2,
      };

      const session = await manager.createSession(config);

      // Round 1 responses
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

      // Round 2 responses
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

      await manager.addResponse(session.id, round1Response1, 1);
      await manager.addResponse(session.id, round1Response2, 1);
      await manager.addResponse(session.id, round2Response1, 2);
      await manager.addResponse(session.id, round2Response2, 2);

      const round1Responses = await manager.getResponsesForRound(session.id, 1);
      expect(round1Responses).toHaveLength(2);
      expect(round1Responses[0]?.position).toBe('Round 1 Position 1');
      expect(round1Responses[1]?.position).toBe('Round 1 Position 2');

      const round2Responses = await manager.getResponsesForRound(session.id, 2);
      expect(round2Responses).toHaveLength(2);
      expect(round2Responses[0]?.position).toBe('Round 2 Position 1');
      expect(round2Responses[1]?.position).toBe('Round 2 Position 2');
    });

    it('should return empty array for round with no responses', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);
      const responses = await manager.getResponsesForRound(session.id, 1);

      expect(responses).toEqual([]);
    });

    it('should return empty array for non-existent session', async () => {
      const responses = await manager.getResponsesForRound('non-existent-id', 1);
      expect(responses).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);
      expect(await manager.getSession(session.id)).not.toBeNull();

      await manager.deleteSession(session.id);
      expect(await manager.getSession(session.id)).toBeNull();
    });

    it('should delete session with responses', async () => {
      const config: DebateConfig = {
        topic: 'Test topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await manager.createSession(config);

      const response: AgentResponse = {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await manager.addResponse(session.id, response, 1);
      expect((await manager.getResponses(session.id)).length).toBe(1);

      await manager.deleteSession(session.id);
      expect(await manager.getSession(session.id)).toBeNull();
      expect((await manager.getResponses(session.id)).length).toBe(0);
    });
  });

  describe('listSessions', () => {
    it('should list all sessions', async () => {
      const config1: DebateConfig = {
        topic: 'Topic 1',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const config2: DebateConfig = {
        topic: 'Topic 2',
        mode: 'adversarial',
        agents: ['agent-2'],
      };

      await manager.createSession(config1);
      await manager.createSession(config2);

      const sessions = await manager.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should return empty array when no sessions exist', async () => {
      const sessions = await manager.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should list sessions in order of creation (newest first)', async () => {
      const config1: DebateConfig = {
        topic: 'First topic',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const config2: DebateConfig = {
        topic: 'Second topic',
        mode: 'collaborative',
        agents: ['agent-2'],
      };

      const session1 = await manager.createSession(config1);
      // Small delay to ensure different timestamps
      const session2 = await manager.createSession(config2);

      const sessions = await manager.listSessions();
      expect(sessions[0]?.id).toBe(session2.id);
      expect(sessions[1]?.id).toBe(session1.id);
    });
  });

  describe('storage ownership', () => {
    it('should not close provided storage when manager is closed', async () => {
      const providedStorage = new SQLiteStorage({ filename: ':memory:' });
      const managerWithProvidedStorage = new SessionManager({ storage: providedStorage });

      managerWithProvidedStorage.close();

      // Storage should still be usable
      const session: any = {
        id: 'test-id',
        topic: 'Test',
        mode: 'collaborative',
        agentIds: ['agent-1'],
        status: 'active',
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await providedStorage.createSession(session);
      expect(await providedStorage.getSession('test-id')).not.toBeNull();

      providedStorage.close();
    });

    it('should create its own storage when none is provided', async () => {
      const managerWithOwnStorage = new SessionManager({ storageFilename: ':memory:' });

      const config: DebateConfig = {
        topic: 'Test',
        mode: 'collaborative',
        agents: ['agent-1'],
      };

      const session = await managerWithOwnStorage.createSession(config);
      expect(await managerWithOwnStorage.getSession(session.id)).not.toBeNull();

      managerWithOwnStorage.close();
    });
  });
});
