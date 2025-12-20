/**
 * Tests for DebateEngine (options-based API)
 *
 * This tests the core debate execution functionality.
 * For AI consensus integration tests, see debate-engine-ai-consensus.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebateEngine } from '../../../src/core/debate-engine.js';
import { MockAgent } from '../../../src/agents/base.js';
import type {
  DebateContext,
  Session,
  AgentToolkit,
} from '../../../src/types/index.js';
import type { DebateModeStrategy } from '../../../src/modes/base.js';

describe('DebateEngine', () => {
  let engine: DebateEngine;
  let mockToolkit: AgentToolkit;

  beforeEach(() => {
    // Create mock toolkit
    mockToolkit = {
      getTools: () => [],
      executeTool: async () => ({}),
      setContext: () => {},
    };

    // Create engine
    engine = new DebateEngine({
      toolkit: mockToolkit,
    });
  });

  describe('constructor', () => {
    it('should create engine with toolkit', () => {
      expect(engine).toBeInstanceOf(DebateEngine);
    });

    it('should throw error if toolkit is not provided', () => {
      expect(() => new DebateEngine({} as any)).toThrow('AgentToolkit must be provided');
    });

    it('should accept optional aiConsensusAnalyzer', () => {
      const engineWithAnalyzer = new DebateEngine({
        toolkit: mockToolkit,
        aiConsensusAnalyzer: undefined,
      });
      expect(engineWithAnalyzer).toBeInstanceOf(DebateEngine);
    });
  });

  describe('registerMode', () => {
    it('should register a mode strategy', () => {
      const mockStrategy: DebateModeStrategy = {
        name: 'test-mode',
        executeRound: vi.fn().mockResolvedValue([]),
        buildAgentPrompt: vi.fn().mockReturnValue('test prompt'),
      };

      engine.registerMode('test-mode', mockStrategy);

      // Mode should be usable now
      expect(() => engine.registerMode('test-mode', mockStrategy)).not.toThrow();
    });
  });

  describe('executeRound', () => {
    const createTestAgent = (id: string, response?: Partial<ReturnType<MockAgent['generateResponse']>>) => {
      const agent = new MockAgent({
        id,
        name: `Agent ${id}`,
        provider: 'anthropic',
        model: 'test-model',
      });
      agent.setMockResponse({
        agentId: id,
        agentName: `Agent ${id}`,
        position: `Position from ${id}`,
        reasoning: `Reasoning from ${id}`,
        confidence: 0.8,
        timestamp: new Date(),
        ...response,
      });
      return agent;
    };

    const defaultContext: DebateContext = {
      sessionId: 'test-session',
      topic: 'Should AI be regulated?',
      mode: 'collaborative',
      currentRound: 1,
      totalRounds: 3,
      previousResponses: [],
    };

    it('should execute round with registered mode strategy', async () => {
      const agents = [createTestAgent('1'), createTestAgent('2')];

      const mockStrategy: DebateModeStrategy = {
        name: 'collaborative',
        executeRound: vi.fn().mockImplementation(async (ags, ctx, tk) => {
          return Promise.all(ags.map((a) => a.generateResponse(ctx)));
        }),
        buildAgentPrompt: vi.fn().mockReturnValue('test prompt'),
      };

      engine.registerMode('collaborative', mockStrategy);

      const result = await engine.executeRound(agents, defaultContext);

      expect(result.roundNumber).toBe(1);
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0].agentId).toBe('1');
      expect(result.responses[1].agentId).toBe('2');
      expect(mockStrategy.executeRound).toHaveBeenCalledWith(agents, defaultContext, mockToolkit);
    });

    it('should fall back to simple round-robin if no strategy registered', async () => {
      const agents = [createTestAgent('1'), createTestAgent('2')];

      const result = await engine.executeRound(agents, defaultContext);

      expect(result.roundNumber).toBe(1);
      expect(result.responses).toHaveLength(2);
      expect(result.consensus).toBeDefined();
    });

    it('should include consensus analysis in result', async () => {
      const agents = [
        createTestAgent('1', { position: 'AI should be regulated for safety' }),
        createTestAgent('2', { position: 'AI should be regulated for public benefit' }),
      ];

      const result = await engine.executeRound(agents, defaultContext);

      expect(result.consensus).toBeDefined();
      expect(typeof result.consensus.agreementLevel).toBe('number');
      expect(result.consensus.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(result.consensus.agreementLevel).toBeLessThanOrEqual(1);
    });

    it('should handle agent errors gracefully', async () => {
      const errorAgent = new MockAgent({
        id: 'error-agent',
        name: 'Error Agent',
        provider: 'anthropic',
        model: 'test-model',
      });
      // Override generateResponse to throw
      vi.spyOn(errorAgent, 'generateResponse').mockRejectedValue(new Error('API error'));

      const goodAgent = createTestAgent('good');

      // Simple round execution should catch errors
      const result = await engine.executeRound([errorAgent, goodAgent], defaultContext);

      // Should have at least the good agent's response
      expect(result.responses.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('executeRounds', () => {
    const createTestAgent = (id: string) => {
      const agent = new MockAgent({
        id,
        name: `Agent ${id}`,
        provider: 'anthropic',
        model: 'test-model',
      });
      agent.setMockResponse({
        agentId: id,
        agentName: `Agent ${id}`,
        position: `Position from ${id}`,
        reasoning: `Reasoning from ${id}`,
        confidence: 0.8,
        timestamp: new Date(),
      });
      return agent;
    };

    const createTestSession = (): Session => ({
      id: 'test-session',
      topic: 'Test topic',
      mode: 'collaborative',
      agentIds: ['1', '2'],
      status: 'active',
      currentRound: 0,
      totalRounds: 3,
      responses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should execute multiple rounds', async () => {
      const agents = [createTestAgent('1'), createTestAgent('2')];
      const session = createTestSession();

      const results = await engine.executeRounds(agents, session, 2);

      expect(results).toHaveLength(2);
      expect(results[0].roundNumber).toBe(1);
      expect(results[1].roundNumber).toBe(2);
      expect(session.currentRound).toBe(2);
    });

    it('should accumulate responses in session', async () => {
      const agents = [createTestAgent('1'), createTestAgent('2')];
      const session = createTestSession();

      await engine.executeRounds(agents, session, 2);

      // 2 agents * 2 rounds = 4 responses
      expect(session.responses).toHaveLength(4);
    });

    it('should pass focusQuestion to context', async () => {
      const agents = [createTestAgent('1')];
      const session = createTestSession();

      const mockStrategy: DebateModeStrategy = {
        name: 'collaborative',
        executeRound: vi.fn().mockImplementation(async (ags, ctx) => {
          expect(ctx.focusQuestion).toBe('What about safety?');
          return Promise.all(ags.map((a) => a.generateResponse(ctx)));
        }),
        buildAgentPrompt: () => 'test',
      };

      engine.registerMode('collaborative', mockStrategy);

      await engine.executeRounds(agents, session, 1, 'What about safety?');

      expect(mockStrategy.executeRound).toHaveBeenCalled();
    });
  });

  describe('analyzeConsensus', () => {
    it('should handle empty responses', () => {
      const result = engine.analyzeConsensus([]);

      expect(result.agreementLevel).toBe(0);
      expect(result.commonPoints).toEqual([]);
      expect(result.disagreementPoints).toEqual([]);
      expect(result.summary).toBe('No responses to analyze');
    });

    it('should analyze identical positions as high agreement', () => {
      const responses = [
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'same position',
          reasoning: 'reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'same position',
          reasoning: 'reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const result = engine.analyzeConsensus(responses);

      expect(result.agreementLevel).toBe(1);
      expect(result.disagreementPoints).toHaveLength(0);
    });

    it('should analyze different positions as lower agreement', () => {
      const responses = [
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'position A is correct',
          reasoning: 'reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'position B is better',
          reasoning: 'reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const result = engine.analyzeConsensus(responses);

      expect(result.agreementLevel).toBeLessThan(1);
      expect(result.disagreementPoints.length).toBeGreaterThan(0);
    });

    it('should find common words across positions', () => {
      const responses = [
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'AI safety is important for development',
          reasoning: 'reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'AI safety should be prioritized in development',
          reasoning: 'reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const result = engine.analyzeConsensus(responses);

      expect(result.commonPoints).toContain('safety');
      expect(result.commonPoints).toContain('development');
    });

    it('should generate summary with agent count', () => {
      const responses = [
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'position',
          reasoning: 'reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'position',
          reasoning: 'reasoning',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const result = engine.analyzeConsensus(responses);

      expect(result.summary).toContain('2 agents');
    });
  });

  describe('toolkit management', () => {
    it('should return current toolkit', () => {
      expect(engine.getToolkit()).toBe(mockToolkit);
    });

    it('should allow setting new toolkit', () => {
      const newToolkit: AgentToolkit = {
        getTools: () => [],
        executeTool: async () => ({ newToolkit: true }),
        setContext: () => {},
      };

      engine.setToolkit(newToolkit);

      expect(engine.getToolkit()).toBe(newToolkit);
    });
  });
});
