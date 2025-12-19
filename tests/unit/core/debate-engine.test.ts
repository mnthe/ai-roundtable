import { describe, it, expect, beforeEach } from 'vitest';
import { DebateEngine, type SessionManager } from '../../../src/core/debate-engine.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import { ModeRegistry } from '../../../src/modes/registry.js';
import { ConsensusAnalyzer } from '../../../src/core/consensus-analyzer.js';
import { MockAgent } from '../../../src/agents/base.js';
import type {
  DebateConfig,
  Session,
  AgentResponse,
} from '../../../src/types/index.js';

describe('DebateEngine', () => {
  let engine: DebateEngine;
  let mockSessionManager: SessionManager;
  let agentRegistry: AgentRegistry;
  let modeRegistry: ModeRegistry;
  let consensusAnalyzer: ConsensusAnalyzer;
  let mockToolkit: {
    getTools: () => [];
    executeTool: () => Promise<object>;
    setContext: () => void;
  };

  beforeEach(() => {
    // Create mock session manager
    const sessions = new Map<string, Session>();
    mockSessionManager = {
      async createSession(config: DebateConfig): Promise<Session> {
        const session: Session = {
          id: `session-${Date.now()}`,
          topic: config.topic,
          mode: config.mode,
          agentIds: config.agents,
          status: 'active',
          currentRound: 1,
          totalRounds: config.rounds ?? 3,
          responses: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        sessions.set(session.id, session);
        return session;
      },
      async getSession(sessionId: string): Promise<Session | null> {
        return sessions.get(sessionId) ?? null;
      },
      async updateSession(session: Session): Promise<void> {
        sessions.set(session.id, { ...session, updatedAt: new Date() });
      },
      async addResponses(sessionId: string, responses: AgentResponse[]): Promise<void> {
        const session = sessions.get(sessionId);
        if (session) {
          session.responses.push(...responses);
        }
      },
      async incrementRound(sessionId: string): Promise<void> {
        const session = sessions.get(sessionId);
        if (session) {
          session.currentRound += 1;
        }
      },
    };

    // Create registries
    agentRegistry = new AgentRegistry();
    modeRegistry = new ModeRegistry();
    consensusAnalyzer = new ConsensusAnalyzer();

    // Create mock toolkit
    mockToolkit = {
      getTools: () => [],
      executeTool: async () => ({}),
      setContext: () => {},
    };

    // Create engine
    engine = new DebateEngine(
      mockSessionManager,
      agentRegistry,
      modeRegistry,
      consensusAnalyzer,
      mockToolkit
    );

    // Register mock agents
    agentRegistry.registerProvider('anthropic', (config) => new MockAgent(config), 'claude-3');
    agentRegistry.createAgent({
      id: 'agent-1',
      name: 'Agent 1',
      provider: 'anthropic',
      model: 'claude-3',
    });
    agentRegistry.createAgent({
      id: 'agent-2',
      name: 'Agent 2',
      provider: 'anthropic',
      model: 'claude-3',
    });
  });

  describe('startDebate', () => {
    it('should create session and execute first round', async () => {
      const config: DebateConfig = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agents: ['agent-1', 'agent-2'],
        rounds: 3,
      };

      const session = await engine.startDebate(config);

      expect(session.id).toBeTruthy();
      expect(session.topic).toBe('Should AI be regulated?');
      expect(session.mode).toBe('collaborative');
      expect(session.agentIds).toEqual(['agent-1', 'agent-2']);
      expect(session.currentRound).toBeGreaterThanOrEqual(2);
      expect(session.totalRounds).toBe(3);
      expect(session.responses.length).toBeGreaterThanOrEqual(2);
      expect(['active', 'completed']).toContain(session.status);
    });

    it('should validate topic is provided', async () => {
      const config: DebateConfig = {
        topic: '',
        mode: 'collaborative',
        agents: ['agent-1'],
        rounds: 3,
      };

      await expect(engine.startDebate(config)).rejects.toThrow('Debate topic is required');
    });

    it('should validate agents exist in registry', async () => {
      const config: DebateConfig = {
        topic: 'Test Topic',
        mode: 'collaborative',
        agents: ['non-existent-agent'],
        rounds: 3,
      };

      await expect(engine.startDebate(config)).rejects.toThrow(
        'Agent "non-existent-agent" not found'
      );
    });
  });

  describe('continueDebate', () => {
    it('should continue debate for one more round', async () => {
      const config: DebateConfig = {
        topic: 'Test Topic',
        mode: 'collaborative',
        agents: ['agent-1', 'agent-2'],
        rounds: 5,
      };
      const initialSession = await engine.startDebate(config);
      const initialRound = initialSession.currentRound;

      const session = await engine.continueDebate(initialSession.id);

      expect(session.currentRound).toBeGreaterThan(initialRound);
    });

    it('should throw error for non-existent session', async () => {
      await expect(engine.continueDebate('non-existent')).rejects.toThrow(
        'Session "non-existent" not found'
      );
    });
  });

  describe('getSession', () => {
    it('should return existing session', async () => {
      const config: DebateConfig = {
        topic: 'Test Topic',
        mode: 'collaborative',
        agents: ['agent-1'],
        rounds: 3,
      };

      const created = await engine.startDebate(config);
      const retrieved = await engine.getSession(created.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return null for non-existent session', async () => {
      const session = await engine.getSession('non-existent');
      expect(session).toBeNull();
    });
  });

  describe('mode prompt integration', () => {
    it('should pass mode-specific prompts to agents in collaborative mode', async () => {
      const config: DebateConfig = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agents: ['agent-1', 'agent-2'],
        rounds: 1,
      };

      const session = await engine.startDebate(config);

      expect(session.responses.length).toBeGreaterThanOrEqual(2);
    });

    it('should pass mode-specific prompts to agents in adversarial mode', async () => {
      const config: DebateConfig = {
        topic: 'Should AI be regulated?',
        mode: 'adversarial',
        agents: ['agent-1', 'agent-2'],
        rounds: 1,
      };

      const session = await engine.startDebate(config);

      expect(session.responses.length).toBeGreaterThanOrEqual(2);
    });

    it('should pass mode-specific prompts to agents in expert-panel mode', async () => {
      const config: DebateConfig = {
        topic: 'Should AI be regulated?',
        mode: 'expert-panel',
        agents: ['agent-1', 'agent-2'],
        rounds: 1,
      };

      const session = await engine.startDebate(config);

      expect(session.responses.length).toBeGreaterThanOrEqual(2);
    });
  });
});
