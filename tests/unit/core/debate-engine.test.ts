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
  ConsensusResult,
} from '../../../src/types/index.js';
import type { DebateModeStrategy } from '../../../src/modes/base.js';
import type { AIConsensusAnalyzer } from '../../../src/core/ai-consensus-analyzer.js';

/**
 * Create a mock AIConsensusAnalyzer for testing
 */
function createMockAIConsensusAnalyzer(): AIConsensusAnalyzer {
  return {
    analyzeConsensus: vi.fn().mockResolvedValue({
      agreementLevel: 0.75,
      commonGround: ['Test common ground'],
      disagreementPoints: [],
      summary: 'Mock consensus analysis',
    } as ConsensusResult),
    getDiagnostics: vi.fn().mockReturnValue({
      available: true,
      registeredProviders: 1,
      providerNames: ['anthropic'],
      totalAgents: 1,
      activeAgents: 1,
      inactiveAgents: [],
    }),
  } as unknown as AIConsensusAnalyzer;
}

describe('DebateEngine', () => {
  let engine: DebateEngine;
  let mockToolkit: AgentToolkit;
  let mockAIConsensusAnalyzer: AIConsensusAnalyzer;

  beforeEach(() => {
    // Create mock toolkit with context request support
    mockToolkit = {
      getTools: () => [],
      executeTool: async () => ({}),
      setContext: () => {},
      getPendingContextRequests: () => [],
      clearPendingRequests: () => {},
      hasPendingRequests: () => false,
    };

    // Create mock AI consensus analyzer
    mockAIConsensusAnalyzer = createMockAIConsensusAnalyzer();

    // Create engine with mock analyzer
    engine = new DebateEngine({
      toolkit: mockToolkit,
      aiConsensusAnalyzer: mockAIConsensusAnalyzer,
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
    const createTestAgent = (
      id: string,
      response?: Partial<ReturnType<MockAgent['generateResponse']>>
    ) => {
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

  describe('toolkit management', () => {
    it('should return current toolkit', () => {
      expect(engine.getToolkit()).toBe(mockToolkit);
    });

    it('should allow setting new toolkit', () => {
      const newToolkit: AgentToolkit = {
        getTools: () => [],
        executeTool: async () => ({ newToolkit: true }),
        setContext: () => {},
        getPendingContextRequests: () => [],
        clearPendingRequests: () => {},
        hasPendingRequests: () => false,
      };

      engine.setToolkit(newToolkit);

      expect(engine.getToolkit()).toBe(newToolkit);
    });
  });

  describe('context request flow', () => {
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

    const defaultContext: DebateContext = {
      sessionId: 'test-session',
      topic: 'Should AI be regulated?',
      mode: 'collaborative',
      currentRound: 1,
      totalRounds: 3,
      previousResponses: [],
    };

    it('should clear pending context requests at start of round', async () => {
      const clearPendingRequestsMock = vi.fn();
      const toolkitWithContextRequests: AgentToolkit = {
        getTools: () => [],
        executeTool: async () => ({}),
        setContext: () => {},
        getPendingContextRequests: () => [],
        clearPendingRequests: clearPendingRequestsMock,
        hasPendingRequests: () => false,
      };

      const engineWithContextToolkit = new DebateEngine({
        toolkit: toolkitWithContextRequests,
        aiConsensusAnalyzer: mockAIConsensusAnalyzer,
      });

      const agents = [createTestAgent('1')];
      await engineWithContextToolkit.executeRound(agents, defaultContext);

      expect(clearPendingRequestsMock).toHaveBeenCalled();
    });

    it('should collect pending context requests after round execution', async () => {
      const mockContextRequests = [
        {
          id: 'ctx-1',
          agentId: 'agent-1',
          query: 'What is the current AI regulation status?',
          reason: 'Need updated regulatory context',
          priority: 'required' as const,
          timestamp: new Date(),
        },
        {
          id: 'ctx-2',
          agentId: 'agent-2',
          query: 'Historical precedents for technology regulation',
          reason: 'Would help but not essential',
          priority: 'optional' as const,
          timestamp: new Date(),
        },
      ];

      const toolkitWithContextRequests: AgentToolkit = {
        getTools: () => [],
        executeTool: async () => ({}),
        setContext: () => {},
        getPendingContextRequests: () => mockContextRequests,
        clearPendingRequests: () => {},
        hasPendingRequests: () => true,
      };

      const engineWithContextToolkit = new DebateEngine({
        toolkit: toolkitWithContextRequests,
        aiConsensusAnalyzer: mockAIConsensusAnalyzer,
      });

      const agents = [createTestAgent('1'), createTestAgent('2')];
      const result = await engineWithContextToolkit.executeRound(agents, defaultContext);

      expect(result.contextRequests).toBeDefined();
      expect(result.contextRequests).toHaveLength(2);
      expect(result.contextRequests?.[0].query).toBe('What is the current AI regulation status?');
      expect(result.contextRequests?.[1].priority).toBe('optional');
    });

    it('should not include contextRequests in result when there are none', async () => {
      const toolkitNoRequests: AgentToolkit = {
        getTools: () => [],
        executeTool: async () => ({}),
        setContext: () => {},
        getPendingContextRequests: () => [],
        clearPendingRequests: () => {},
        hasPendingRequests: () => false,
      };

      const engineNoRequests = new DebateEngine({
        toolkit: toolkitNoRequests,
        aiConsensusAnalyzer: mockAIConsensusAnalyzer,
      });

      const agents = [createTestAgent('1')];
      const result = await engineNoRequests.executeRound(agents, defaultContext);

      expect(result.contextRequests).toBeUndefined();
    });

    it('should collect context requests when using registered mode strategy', async () => {
      const mockContextRequests = [
        {
          id: 'ctx-1',
          agentId: 'agent-1',
          query: 'Test query',
          reason: 'Test reason',
          priority: 'required' as const,
          timestamp: new Date(),
        },
      ];

      const toolkitWithRequests: AgentToolkit = {
        getTools: () => [],
        executeTool: async () => ({}),
        setContext: () => {},
        getPendingContextRequests: () => mockContextRequests,
        clearPendingRequests: () => {},
        hasPendingRequests: () => true,
      };

      const engineWithStrategy = new DebateEngine({
        toolkit: toolkitWithRequests,
        aiConsensusAnalyzer: mockAIConsensusAnalyzer,
      });

      const mockStrategy: DebateModeStrategy = {
        name: 'collaborative',
        executeRound: vi.fn().mockImplementation(async (ags, ctx) => {
          return Promise.all(ags.map((a) => a.generateResponse(ctx)));
        }),
        buildAgentPrompt: () => 'test prompt',
      };

      engineWithStrategy.registerMode('collaborative', mockStrategy);

      const agents = [createTestAgent('1')];
      const result = await engineWithStrategy.executeRound(agents, defaultContext);

      expect(result.contextRequests).toBeDefined();
      expect(result.contextRequests).toHaveLength(1);
    });

    it('should pass contextResults to first round only in executeRounds', async () => {
      const receivedContexts: import('../../../src/types/index.js').DebateContext[] = [];

      const captureAgent = new MockAgent({
        id: 'capture-agent',
        name: 'Capture Agent',
        provider: 'anthropic' as const,
        model: 'mock',
      });

      // Override generateResponse to capture context
      captureAgent.generateResponse = vi.fn().mockImplementation(async (ctx) => {
        receivedContexts.push({ ...ctx });
        return {
          agentId: 'capture-agent',
          agentName: 'Capture Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const contextResults = [
        {
          requestId: 'ctx-123',
          success: true,
          result: 'Here is the information you requested about AI regulations.',
        },
        {
          requestId: 'ctx-456',
          success: false,
          error: 'Unable to find requested information.',
        },
      ];

      const session: import('../../../src/types/index.js').Session = {
        id: 'test-session',
        topic: 'AI regulation',
        mode: 'collaborative' as const,
        agentIds: ['capture-agent'],
        status: 'active' as const,
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const results = await engine.executeRounds(
        [captureAgent],
        session,
        2,
        undefined,
        contextResults
      );

      expect(results).toHaveLength(2);
      expect(receivedContexts).toHaveLength(2);

      // First round should have contextResults
      expect(receivedContexts[0].contextResults).toBeDefined();
      expect(receivedContexts[0].contextResults).toHaveLength(2);
      expect(receivedContexts[0].contextResults?.[0].requestId).toBe('ctx-123');
      expect(receivedContexts[0].contextResults?.[0].success).toBe(true);
      expect(receivedContexts[0].contextResults?.[1].success).toBe(false);

      // Second round should NOT have contextResults
      expect(receivedContexts[1].contextResults).toBeUndefined();
    });

    it('should not include contextResults when not provided', async () => {
      const receivedContexts: import('../../../src/types/index.js').DebateContext[] = [];

      const captureAgent = new MockAgent({
        id: 'capture-agent',
        name: 'Capture Agent',
        provider: 'anthropic' as const,
        model: 'mock',
      });

      captureAgent.generateResponse = vi.fn().mockImplementation(async (ctx) => {
        receivedContexts.push({ ...ctx });
        return {
          agentId: 'capture-agent',
          agentName: 'Capture Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const session: import('../../../src/types/index.js').Session = {
        id: 'test-session',
        topic: 'AI regulation',
        mode: 'collaborative' as const,
        agentIds: ['capture-agent'],
        status: 'active' as const,
        currentRound: 0,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await engine.executeRounds([captureAgent], session, 1);

      expect(receivedContexts).toHaveLength(1);
      expect(receivedContexts[0].contextResults).toBeUndefined();
    });
  });
});
