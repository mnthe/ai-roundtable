/**
 * Tests for AIConsensusAnalyzer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIConsensusAnalyzer } from '../../../src/core/ai-consensus-analyzer.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import type { AgentResponse, AIConsensusResult } from '../../../src/types/index.js';

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

// Sample responses for testing
const createSampleResponses = (): AgentResponse[] => [
  {
    agentId: 'claude-default',
    agentName: 'Claude',
    position: 'AI technology should be developed responsibly with proper safety measures.',
    reasoning: 'Given the potential impact, we need careful development.',
    confidence: 0.85,
    timestamp: new Date(),
  },
  {
    agentId: 'chatgpt-default',
    agentName: 'ChatGPT',
    position: 'Artificial intelligence development requires responsible approaches and safety considerations.',
    reasoning: 'The technology is powerful and needs oversight.',
    confidence: 0.80,
    timestamp: new Date(),
  },
];

describe('AIConsensusAnalyzer', () => {
  let registry: AgentRegistry;
  let analyzer: AIConsensusAnalyzer;

  beforeEach(() => {
    registry = new AgentRegistry();
    analyzer = new AIConsensusAnalyzer({
      registry,
      fallbackToRuleBased: true,
    });
  });

  describe('Constructor', () => {
    it('should create an instance with registry', () => {
      expect(analyzer).toBeInstanceOf(AIConsensusAnalyzer);
    });

    it('should accept optional preferredProvider', () => {
      const analyzerWithPreference = new AIConsensusAnalyzer({
        registry,
        preferredProvider: 'anthropic',
      });
      expect(analyzerWithPreference).toBeInstanceOf(AIConsensusAnalyzer);
    });
  });

  describe('analyzeConsensus', () => {
    describe('Edge cases', () => {
      it('should return empty result for no responses', async () => {
        const result = await analyzer.analyzeConsensus([], 'Test topic');

        expect(result.agreementLevel).toBe(0);
        expect(result.commonPoints).toEqual([]);
        expect(result.disagreementPoints).toEqual([]);
        expect(result.summary).toBe('No responses to analyze');
      });

      it('should return full agreement for single response', async () => {
        const responses = [createSampleResponses()[0]!];
        const result = await analyzer.analyzeConsensus(responses, 'Test topic');

        expect(result.agreementLevel).toBe(1);
        expect(result.commonPoints.length).toBeGreaterThan(0);
        expect(result.disagreementPoints).toEqual([]);
        expect(result.clusters).toBeDefined();
        expect(result.clusters![0]!.theme).toBe('Single Position');
      });
    });

    describe('Fallback behavior', () => {
      it('should use basic analysis when no agents available', async () => {
        const responses = createSampleResponses();
        const result = await analyzer.analyzeConsensus(responses, 'AI Development');

        // Should get a valid result from fallback
        expect(result.agreementLevel).toBeGreaterThanOrEqual(0);
        expect(result.agreementLevel).toBeLessThanOrEqual(1);
        expect(result.summary).toBeDefined();
      });

      it('should include fallback reasoning when AI unavailable', async () => {
        const responses = createSampleResponses();
        const result = await analyzer.analyzeConsensus(responses, 'Test topic');

        // Fallback analysis should indicate AI was unavailable
        expect(result.reasoning).toContain('AI unavailable');
      });
    });

    describe('With AI agent', () => {
      beforeEach(() => {
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
      });

      it('should use AI agent when available', async () => {
        const responses = createSampleResponses();
        const result = await analyzer.analyzeConsensus(responses, 'AI Development');

        // AI analysis should return structured result
        expect(result).toBeDefined();
        expect(typeof result.agreementLevel).toBe('number');
      });
    });

    describe('Result structure', () => {
      it('should return ConsensusResult compatible structure', async () => {
        const responses = createSampleResponses();
        const result = await analyzer.analyzeConsensus(responses, 'Test topic');

        // Must have base ConsensusResult fields
        expect(result).toHaveProperty('agreementLevel');
        expect(result).toHaveProperty('commonPoints');
        expect(result).toHaveProperty('disagreementPoints');
        expect(result).toHaveProperty('summary');

        // Types should be correct
        expect(typeof result.agreementLevel).toBe('number');
        expect(Array.isArray(result.commonPoints)).toBe(true);
        expect(Array.isArray(result.disagreementPoints)).toBe(true);
        expect(typeof result.summary).toBe('string');
      });

      it('should clamp agreementLevel between 0 and 1', async () => {
        const responses = createSampleResponses();
        const result = await analyzer.analyzeConsensus(responses, 'Test topic');

        expect(result.agreementLevel).toBeGreaterThanOrEqual(0);
        expect(result.agreementLevel).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Fallback disabled', () => {
    it('should return empty result when fallback disabled and no agents', async () => {
      const analyzerNoFallback = new AIConsensusAnalyzer({
        registry,
        fallbackToRuleBased: false,
      });

      const responses = createSampleResponses();
      const result = await analyzerNoFallback.analyzeConsensus(responses, 'Test topic');

      // Should contain diagnostic info about why AI is unavailable
      expect(result.summary).toContain('fallback disabled');
      expect(result.summary).toContain('No providers registered');
    });
  });

  describe('getDiagnostics', () => {
    it('should report no providers when registry is empty', () => {
      const diagnostics = analyzer.getDiagnostics();

      expect(diagnostics.available).toBe(false);
      expect(diagnostics.registeredProviders).toBe(0);
      expect(diagnostics.totalAgents).toBe(0);
      expect(diagnostics.reason).toContain('No providers registered');
    });

    it('should report no agents when providers exist but no agents created', () => {
      registry.registerProvider(
        'anthropic',
        () => createMockAgent('test', 'anthropic') as any,
        'test-model'
      );

      const diagnostics = analyzer.getDiagnostics();

      expect(diagnostics.available).toBe(false);
      expect(diagnostics.registeredProviders).toBe(1);
      expect(diagnostics.totalAgents).toBe(0);
      expect(diagnostics.reason).toContain('No agents created');
    });

    it('should report available when active agents exist', () => {
      registry.registerProvider(
        'anthropic',
        () => createMockAgent('test', 'anthropic') as any,
        'test-model'
      );
      registry.createAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const diagnostics = analyzer.getDiagnostics();

      expect(diagnostics.available).toBe(true);
      expect(diagnostics.activeAgents).toBe(1);
      expect(diagnostics.reason).toBeUndefined();
    });

    it('should report inactive agents with errors', () => {
      registry.registerProvider(
        'anthropic',
        () => createMockAgent('test', 'anthropic') as any,
        'test-model'
      );
      registry.createAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'test-model',
      });
      registry.deactivateAgent('test-agent', 'API key invalid');

      const diagnostics = analyzer.getDiagnostics();

      expect(diagnostics.available).toBe(false);
      expect(diagnostics.activeAgents).toBe(0);
      expect(diagnostics.inactiveAgents).toHaveLength(1);
      expect(diagnostics.inactiveAgents[0]!.error).toBe('API key invalid');
      expect(diagnostics.reason).toContain('health checks');
    });

    it('should report preferred provider availability', () => {
      const analyzerWithPref = new AIConsensusAnalyzer({
        registry,
        preferredProvider: 'openai',
      });

      registry.registerProvider(
        'anthropic',
        () => createMockAgent('test', 'anthropic') as any,
        'test-model'
      );
      registry.createAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const diagnostics = analyzerWithPref.getDiagnostics();

      expect(diagnostics.preferredProvider).toBe('openai');
      expect(diagnostics.preferredProviderAvailable).toBe(false);
      expect(diagnostics.available).toBe(true); // Still available via fallback
      expect(diagnostics.reason).toContain('Preferred provider');
    });
  });

  describe('Diagnostic information in fallback reasoning', () => {
    it('should include hint about missing API keys when no agents', async () => {
      const responses = createSampleResponses();
      const result = await analyzer.analyzeConsensus(responses, 'Test topic');

      expect(result.reasoning).toContain('No agents registered');
      expect(result.reasoning).toContain('API keys');
    });

    it('should include health check errors when all agents failed', async () => {
      registry.registerProvider(
        'anthropic',
        () => createMockAgent('test', 'anthropic') as any,
        'test-model'
      );
      registry.createAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'test-model',
      });
      registry.deactivateAgent('test-agent', 'Connection refused');

      const responses = createSampleResponses();
      const result = await analyzer.analyzeConsensus(responses, 'Test topic');

      expect(result.reasoning).toContain('health checks');
      expect(result.reasoning).toContain('Connection refused');
    });
  });
});

describe('AIConsensusResult type', () => {
  it('should extend ConsensusResult with optional AI fields', () => {
    const result: AIConsensusResult = {
      agreementLevel: 0.75,
      commonPoints: ['Point 1'],
      disagreementPoints: ['Diff 1'],
      summary: 'Test summary',
      // AI-specific optional fields
      clusters: [
        {
          theme: 'Agreement',
          agentIds: ['agent-1'],
          summary: 'Cluster summary',
        },
      ],
      nuances: {
        partialAgreements: ['Partial'],
        conditionalPositions: ['Conditional'],
        uncertainties: ['Uncertain'],
      },
      reasoning: 'AI reasoning',
      analyzerId: 'analyzer-1',
    };

    expect(result.clusters).toBeDefined();
    expect(result.nuances).toBeDefined();
    expect(result.reasoning).toBeDefined();
    expect(result.analyzerId).toBeDefined();
  });

  it('should be compatible with ConsensusResult interface', () => {
    const aiResult: AIConsensusResult = {
      agreementLevel: 0.5,
      commonPoints: [],
      disagreementPoints: [],
      summary: 'Test',
    };

    // Should be assignable to ConsensusResult
    const baseResult: { agreementLevel: number; summary: string } = aiResult;
    expect(baseResult.agreementLevel).toBe(0.5);
  });
});
