/**
 * Tests for AIConsensusAnalyzer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIConsensusAnalyzer } from '../../../src/core/ai-consensus-analyzer.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import type { AgentResponse, AIConsensusResult } from '../../../src/types/index.js';
import {
  cleanLLMResponse,
  parsePartialJsonResponse,
  extractAgreementLevelFromText,
  extractSummaryFromText,
  parseAIConsensusResponse,
} from '../../../src/core/utils/json-parser.js';

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
  generateRawCompletion: vi.fn().mockResolvedValue(
    JSON.stringify({
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
    })
  ),
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
        expect(result.commonGround).toEqual([]);
        expect(result.disagreementPoints).toEqual([]);
        expect(result.summary).toBe('No responses to analyze');
      });

      it('should return full agreement for single response', async () => {
        const responses = [createSampleResponses()[0]!];
        const result = await analyzer.analyzeConsensus(responses, 'Test topic');

        expect(result.agreementLevel).toBe(1);
        expect(result.commonGround.length).toBeGreaterThan(0);
        expect(result.disagreementPoints).toEqual([]);
        expect(result.clusters).toBeDefined();
        expect(result.clusters![0]!.theme).toBe('Single Position');
      });
    });

    describe('Error behavior when no agents available', () => {
      it('should throw error when no agents available', async () => {
        const responses = createSampleResponses();

        await expect(analyzer.analyzeConsensus(responses, 'AI Development')).rejects.toThrow(
          'AI consensus analysis unavailable'
        );
      });

      it('should include diagnostic hint in error message', async () => {
        const responses = createSampleResponses();

        await expect(analyzer.analyzeConsensus(responses, 'Test topic')).rejects.toThrow(
          'No providers registered'
        );
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

      it('should return ConsensusResult compatible structure', async () => {
        const responses = createSampleResponses();
        const result = await analyzer.analyzeConsensus(responses, 'Test topic');

        // Must have base ConsensusResult fields
        expect(result).toHaveProperty('agreementLevel');
        expect(result).toHaveProperty('commonGround');
        expect(result).toHaveProperty('disagreementPoints');
        expect(result).toHaveProperty('summary');

        // Types should be correct
        expect(typeof result.agreementLevel).toBe('number');
        expect(Array.isArray(result.commonGround)).toBe(true);
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

  describe('Error handling', () => {
    it('should throw error with diagnostic info when no agents available', async () => {
      const responses = createSampleResponses();

      await expect(analyzer.analyzeConsensus(responses, 'Test topic')).rejects.toThrow(
        /AI consensus analysis unavailable.*No providers registered/
      );
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

  describe('Diagnostic information in error messages', () => {
    it('should include hint about missing API keys when no agents', async () => {
      const responses = createSampleResponses();

      await expect(analyzer.analyzeConsensus(responses, 'Test topic')).rejects.toThrow(
        /No agents registered.*API keys/
      );
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

      await expect(analyzer.analyzeConsensus(responses, 'Test topic')).rejects.toThrow(
        /health checks.*Connection refused/
      );
    });
  });
});

describe('JSON parsing strategies', () => {
  describe('cleanLLMResponse', () => {
    it('should strip complete markdown code fences', () => {
      const input = '```json\n{"agreementLevel": 0.75}\n```';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.75}');
    });

    it('should handle incomplete markdown code fences (truncated response)', () => {
      const input = '```json\n{"agreementLevel": 0.75, "summary": "truncated';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.75, "summary": "truncated');
    });

    it('should extract JSON from text with leading content', () => {
      const input = 'Here is the analysis:\n{"agreementLevel": 0.5}';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.5}');
    });
  });

  describe('parsePartialJsonResponse', () => {
    it('should parse truncated JSON with agreementLevel', () => {
      const input = '{"agreementLevel": 0.62, "clusters": [{"theme": "Test';
      const result = parsePartialJsonResponse(input, 'test-analyzer');

      expect(result).not.toBeNull();
      expect(result!.agreementLevel).toBe(0.62);
      expect(result!.analyzerId).toBe('test-analyzer');
    });

    it('should return null if no agreementLevel found', () => {
      const input = '{"clusters": [{"theme": "Test"';
      const result = parsePartialJsonResponse(input, 'test');

      expect(result).toBeNull();
    });

    it('should extract commonGround array from partial JSON', () => {
      const input = '{"agreementLevel": 0.8, "commonGround": ["Point A", "Point B"], "summary": "Test';
      const result = parsePartialJsonResponse(input, 'test');

      expect(result).not.toBeNull();
      expect(result!.commonGround).toEqual(['Point A', 'Point B']);
    });
  });

  describe('extractAgreementLevelFromText', () => {
    it('should extract agreementLevel from malformed JSON', () => {
      const input = '{"agreementLevel": 0.75, broken json here';
      const result = extractAgreementLevelFromText(input);
      expect(result).toBe(0.75);
    });

    it('should return null for invalid agreementLevel', () => {
      const input = '{"agreementLevel": "high"}';
      const result = extractAgreementLevelFromText(input);
      expect(result).toBeNull();
    });

    it('should reject out of range values', () => {
      expect(extractAgreementLevelFromText('{"agreementLevel": 1.5}')).toBeNull();
      expect(extractAgreementLevelFromText('{"agreementLevel": -0.5}')).toBeNull();
    });
  });

  describe('extractSummaryFromText', () => {
    it('should extract summary from partial JSON', () => {
      const input = '{"agreementLevel": 0.5, "summary": "This is a test summary", "other';
      const result = extractSummaryFromText(input);
      expect(result).toBe('This is a test summary');
    });

    it('should return null if no summary found', () => {
      const input = '{"agreementLevel": 0.5}';
      const result = extractSummaryFromText(input);
      expect(result).toBeNull();
    });
  });

  describe('parseAIConsensusResponse - full integration', () => {
    it('should parse complete valid JSON', () => {
      const input = JSON.stringify({
        agreementLevel: 0.85,
        commonGround: ['Point 1', 'Point 2'],
        disagreementPoints: ['Diff 1'],
        summary: 'Test summary',
        reasoning: 'Test reasoning',
      });
      const result = parseAIConsensusResponse(input, { analyzerId: 'test' });

      expect(result.agreementLevel).toBe(0.85);
      expect(result.commonGround).toEqual(['Point 1', 'Point 2']);
      expect(result.summary).toBe('Test summary');
    });

    it('should handle markdown-wrapped JSON', () => {
      const input = '```json\n{"agreementLevel": 0.7, "commonGround": [], "disagreementPoints": [], "summary": "Test"}\n```';
      const result = parseAIConsensusResponse(input, { analyzerId: 'test' });

      expect(result.agreementLevel).toBe(0.7);
    });

    it('should handle truncated markdown JSON', () => {
      const input = '```json\n{"agreementLevel": 0.65, "clusters": [{"theme": "Context-Dependent Pragmatism", "agentIds": ["claude", "chatgpt"], "summary": "TypeScript\'s value dep';
      const result = parseAIConsensusResponse(input, { analyzerId: 'test' });

      expect(result.agreementLevel).toBe(0.65);
      expect(result.analyzerId).toBe('test');
    });

    it('should use regex extraction as fallback', () => {
      // This JSON is so malformed that even partial-json can't parse it
      const input = '{"agreementLevel": 0.42 malformed content without proper JSON structure';
      const result = parseAIConsensusResponse(input, { analyzerId: 'test' });

      expect(result.agreementLevel).toBe(0.42);
      expect(result.reasoning).toContain('partial/malformed');
    });

    it('should return default 0.5 when all strategies fail', () => {
      const input = 'This is not JSON at all, just plain text';
      const result = parseAIConsensusResponse(input, { analyzerId: 'test' });

      expect(result.agreementLevel).toBe(0.5);
      expect(result.commonGround).toContain('Unable to determine common ground');
    });
  });
});

describe('AIConsensusResult type', () => {
  it('should extend ConsensusResult with optional AI fields', () => {
    const result: AIConsensusResult = {
      agreementLevel: 0.75,
      commonGround: ['Point 1'],
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
      commonGround: [],
      disagreementPoints: [],
      summary: 'Test',
    };

    // Should be assignable to ConsensusResult
    const baseResult: { agreementLevel: number; summary: string } = aiResult;
    expect(baseResult.agreementLevel).toBe(0.5);
  });
});
