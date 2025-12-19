/**
 * Tests for DebateEngine with AI Consensus Integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebateEngine } from '../../../src/core/DebateEngine.js';
import { AIConsensusAnalyzer } from '../../../src/core/ai-consensus-analyzer.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse } from '../../../src/types/index.js';

// Mock agent for testing
const createMockAgent = (id: string, provider: 'anthropic' | 'openai' | 'google' | 'perplexity') => ({
  getInfo: () => ({
    id,
    name: `Test ${provider}`,
    provider,
    model: 'test-model',
  }),
  generateResponse: vi.fn().mockResolvedValue({
    agentId: id,
    agentName: `Test ${provider}`,
    position: JSON.stringify({
      agreementLevel: 0.75,
      clusters: [{ theme: 'Agreement', agentIds: ['agent-1', 'agent-2'], summary: 'Both agree' }],
      commonGround: ['Point A', 'Point B'],
      disagreementPoints: ['Difference 1'],
      nuances: {
        partialAgreements: ['Partial agreement on X'],
        conditionalPositions: [],
        uncertainties: [],
      },
      summary: 'Test summary',
      reasoning: 'Test reasoning',
    }),
    reasoning: 'Analysis complete',
    confidence: 0.8,
    timestamp: new Date(),
  }),
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
});

describe('DebateEngine with AI Consensus', () => {
  let engine: DebateEngine;
  let registry: AgentRegistry;
  let aiConsensusAnalyzer: AIConsensusAnalyzer;
  let mockToolkit: {
    getTools: () => [];
    executeTool: () => Promise<object>;
    setContext: () => void;
  };

  beforeEach(() => {
    registry = new AgentRegistry();
    mockToolkit = {
      getTools: () => [],
      executeTool: async () => ({}),
      setContext: () => {},
    };

    // Register mock agent
    const mockAgent = createMockAgent('test-agent', 'anthropic');
    registry.registerProvider(
      'anthropic',
      () => mockAgent as any,
      'test-model'
    );
    registry.createAgent({
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'anthropic',
      model: 'test-model',
    });

    // Create AI consensus analyzer
    aiConsensusAnalyzer = new AIConsensusAnalyzer({
      registry,
      fallbackToRuleBased: true,
    });

    // Create engine with AI consensus analyzer
    engine = new DebateEngine({
      toolkit: mockToolkit,
      aiConsensusAnalyzer,
    });
  });

  describe('Constructor', () => {
    it('should create engine with AI consensus analyzer', () => {
      expect(engine).toBeInstanceOf(DebateEngine);
    });

    it('should create engine without AI consensus analyzer', () => {
      const engineWithoutAI = new DebateEngine({
        toolkit: mockToolkit,
      });
      expect(engineWithoutAI).toBeInstanceOf(DebateEngine);
    });

    it('should require toolkit', () => {
      expect(() => new DebateEngine({} as any)).toThrow('AgentToolkit must be provided');
    });
  });

  describe('executeRound with AI consensus', () => {
    it('should use AI consensus when available', async () => {
      const agents = [
        new MockAgent({
          id: 'agent-1',
          name: 'Agent 1',
          provider: 'anthropic',
          model: 'test',
        }),
        new MockAgent({
          id: 'agent-2',
          name: 'Agent 2',
          provider: 'anthropic',
          model: 'test',
        }),
      ];

      // Set mock responses
      agents[0].setMockResponse({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'AI should be developed carefully',
        reasoning: 'Safety is important',
        confidence: 0.8,
        timestamp: new Date(),
      });

      agents[1].setMockResponse({
        agentId: 'agent-2',
        agentName: 'Agent 2',
        position: 'Artificial intelligence requires careful development',
        reasoning: 'Safety matters',
        confidence: 0.85,
        timestamp: new Date(),
      });

      // Register a mode strategy
      engine.registerMode('collaborative', {
        name: 'collaborative',
        executeRound: async (ags, ctx, tk) => {
          return Promise.all(ags.map((a) => a.generateResponse(ctx)));
        },
        buildAgentPrompt: () => 'Test prompt',
      });

      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'AI Development',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const result = await engine.executeRound(agents, context);

      expect(result).toBeDefined();
      expect(result.roundNumber).toBe(1);
      expect(result.responses.length).toBe(2);
      expect(result.consensus).toBeDefined();
      expect(result.consensus.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(result.consensus.agreementLevel).toBeLessThanOrEqual(1);
    });
  });

  describe('analyzeConsensusWithAI', () => {
    const sampleResponses: AgentResponse[] = [
      {
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'AI should be developed carefully',
        reasoning: 'Safety is important',
        confidence: 0.8,
        timestamp: new Date(),
      },
      {
        agentId: 'agent-2',
        agentName: 'Agent 2',
        position: 'Artificial intelligence requires careful development',
        reasoning: 'Safety matters',
        confidence: 0.85,
        timestamp: new Date(),
      },
    ];

    it('should use AI analyzer when available', async () => {
      const result = await engine.analyzeConsensusWithAI(sampleResponses, 'AI Development');

      expect(result).toBeDefined();
      expect(typeof result.agreementLevel).toBe('number');
      expect(Array.isArray(result.commonPoints)).toBe(true);
      expect(Array.isArray(result.disagreementPoints)).toBe(true);
      expect(typeof result.summary).toBe('string');
    });

    it('should fall back to rule-based on AI error', async () => {
      // Create engine without AI analyzer
      const engineWithoutAI = new DebateEngine({
        toolkit: mockToolkit,
      });

      const result = await engineWithoutAI.analyzeConsensusWithAI(sampleResponses, 'AI Development');

      expect(result).toBeDefined();
      expect(result.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(result.agreementLevel).toBeLessThanOrEqual(1);
    });

    it('should handle empty responses', async () => {
      const result = await engine.analyzeConsensusWithAI([], 'Test Topic');

      expect(result.agreementLevel).toBe(0);
      expect(result.commonPoints).toEqual([]);
      expect(result.disagreementPoints).toEqual([]);
      expect(result.summary).toBe('No responses to analyze');
    });

    it('should handle single response', async () => {
      const singleResponse = [sampleResponses[0]!];
      const result = await engine.analyzeConsensusWithAI(singleResponse, 'Test Topic');

      expect(result.agreementLevel).toBe(1);
      expect(result.commonPoints.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeConsensus (rule-based fallback)', () => {
    const sampleResponses: AgentResponse[] = [
      {
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Position A',
        reasoning: 'Reasoning A',
        confidence: 0.8,
        timestamp: new Date(),
      },
      {
        agentId: 'agent-2',
        agentName: 'Agent 2',
        position: 'Position B',
        reasoning: 'Reasoning B',
        confidence: 0.7,
        timestamp: new Date(),
      },
    ];

    it('should provide basic consensus analysis', () => {
      const result = engine.analyzeConsensus(sampleResponses);

      expect(result).toBeDefined();
      expect(typeof result.agreementLevel).toBe('number');
      expect(result.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(result.agreementLevel).toBeLessThanOrEqual(1);
    });

    it('should handle empty responses', () => {
      const result = engine.analyzeConsensus([]);

      expect(result.agreementLevel).toBe(0);
      expect(result.summary).toBe('No responses to analyze');
    });
  });
});
