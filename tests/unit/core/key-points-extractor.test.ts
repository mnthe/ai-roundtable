/**
 * Tests for KeyPointsExtractor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyPointsExtractor } from '../../../src/core/key-points-extractor.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import type { AgentResponse } from '../../../src/types/index.js';

// Mock agent for testing
const createMockAgent = (
  id: string,
  provider: 'anthropic' | 'openai' | 'google' | 'perplexity',
  mockResponse?: Partial<AgentResponse>
) => ({
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
      keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
    }),
    reasoning: 'Analysis complete',
    confidence: 0.8,
    timestamp: new Date(),
    ...mockResponse,
  }),
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  setToolkit: vi.fn(),
});

// Mock agent that throws an error
const createErrorAgent = (
  id: string,
  provider: 'anthropic' | 'openai' | 'google' | 'perplexity',
  errorMessage: string
) => ({
  getInfo: () => ({
    id,
    name: `Test ${provider}`,
    provider,
    model: 'test-model',
  }),
  generateResponse: vi.fn().mockRejectedValue(new Error(errorMessage)),
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  setToolkit: vi.fn(),
});

// Sample response for testing
const createSampleResponse = (
  reasoning: string,
  overrides?: Partial<AgentResponse>
): AgentResponse => ({
  agentId: 'test-agent',
  agentName: 'Test Agent',
  position: 'Test position statement',
  reasoning,
  confidence: 0.85,
  timestamp: new Date(),
  ...overrides,
});

describe('KeyPointsExtractor', () => {
  let registry: AgentRegistry;
  let extractor: KeyPointsExtractor;

  beforeEach(() => {
    registry = new AgentRegistry();
    extractor = new KeyPointsExtractor({
      registry,
      fallbackToRuleBased: true,
    });
  });

  describe('Constructor', () => {
    it('should create an instance with registry', () => {
      expect(extractor).toBeInstanceOf(KeyPointsExtractor);
    });

    it('should accept optional configuration', () => {
      const customExtractor = new KeyPointsExtractor({
        registry,
        preferredProvider: 'anthropic',
        maxKeyPoints: 5,
        fallbackToRuleBased: false,
      });
      expect(customExtractor).toBeInstanceOf(KeyPointsExtractor);
    });
  });

  describe('extractKeyPointsBatch', () => {
    it('should return empty map for no responses', async () => {
      const result = await extractor.extractKeyPointsBatch([]);
      expect(result.size).toBe(0);
    });

    it('should use rule-based extraction when no agents available', async () => {
      const response = createSampleResponse(
        '1. First key point here.\n2. Second key point here.\n3. Third key point here.'
      );

      const result = await extractor.extractKeyPointsBatch([response]);

      expect(result.size).toBe(1);
      const keyPoints = result.get('test-agent');
      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
    });

    describe('With AI agent', () => {
      beforeEach(() => {
        const mockAgent = createMockAgent('test-agent', 'anthropic');
        registry.registerProvider('anthropic', () => mockAgent as any, 'test-model');
        registry.createAgent({
          id: 'test-agent',
          name: 'Test Agent',
          provider: 'anthropic',
          model: 'test-model',
        });
      });

      it('should use AI agent when available', async () => {
        const response = createSampleResponse('Full reasoning text here.');
        const result = await extractor.extractKeyPointsBatch([response]);

        expect(result.size).toBe(1);
        const keyPoints = result.get('test-agent');
        expect(keyPoints).toBeDefined();
      });

      it('should fall back to original reasoning when AI returns no JSON', async () => {
        // Override mock to return non-JSON response
        const mockAgent = createMockAgent('fallback-agent', 'anthropic');
        (mockAgent.generateResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
          agentId: 'fallback-agent',
          agentName: 'Test',
          position: 'No JSON here',
          reasoning: 'No JSON in reasoning either',
          confidence: 0.5,
          timestamp: new Date(),
        });

        registry.registerProvider('anthropic', () => mockAgent as any, 'test-model');
        registry.createAgent({
          id: 'fallback-agent',
          name: 'Fallback Agent',
          provider: 'anthropic',
          model: 'test-model',
        });

        // Create response with clear numbered points in ORIGINAL reasoning
        const response = createSampleResponse(
          '1. This is the first important point from original.\n2. This is the second important point from original.'
        );

        const result = await extractor.extractKeyPointsBatch([response]);

        const keyPoints = result.get('test-agent');
        expect(keyPoints).toBeDefined();
        // Should extract from ORIGINAL reasoning, not AI response
        expect(keyPoints!.some((kp) => kp.includes('original'))).toBe(true);
      });

      it('should fall back to original reasoning when AI returns empty keyPoints', async () => {
        // Override mock to return empty keyPoints array
        const mockAgent = createMockAgent('empty-agent', 'anthropic');
        (mockAgent.generateResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
          agentId: 'empty-agent',
          agentName: 'Test',
          position: JSON.stringify({ keyPoints: [] }),
          reasoning: 'Empty array',
          confidence: 0.5,
          timestamp: new Date(),
        });

        registry.registerProvider('anthropic', () => mockAgent as any, 'test-model');
        registry.createAgent({
          id: 'empty-agent',
          name: 'Empty Agent',
          provider: 'anthropic',
          model: 'test-model',
        });

        const response = createSampleResponse(
          '1. Important point from original reasoning.\n2. Another key insight from original.'
        );

        const result = await extractor.extractKeyPointsBatch([response]);

        const keyPoints = result.get('test-agent');
        expect(keyPoints).toBeDefined();
        expect(keyPoints!.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Rule-based extraction', () => {
    it('should extract numbered points', async () => {
      const response = createSampleResponse(
        '1. First important point.\n2. Second important point.\n3. Third important point.'
      );

      const result = await extractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBe(3);
      expect(keyPoints![0]).toContain('First important');
    });

    it('should extract sentences as fallback', async () => {
      const response = createSampleResponse(
        'This is the first sentence with important information. This is another sentence with more context. A third sentence provides additional insight.'
      );

      const result = await extractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
    });

    it('should handle empty reasoning gracefully', async () => {
      const response = createSampleResponse('');

      const result = await extractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0); // Should have at least fallback
    });

    it('should skip short numbered points (less than 10 chars)', async () => {
      const response = createSampleResponse(
        '1. Short\n2. Also short\n3. This is a longer point that should be extracted properly.'
      );

      const result = await extractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
      // Only the longer point should be extracted
      expect(keyPoints!.some((kp) => kp.includes('longer point'))).toBe(true);
    });

    it('should handle different numbering formats', async () => {
      const response = createSampleResponse(
        '1) First numbered point with parenthesis.\n2: Second point with colon format.\n3. Third point with period format.'
      );

      const result = await extractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBe(3);
    });

    it('should preserve decimal numbers in sentences', async () => {
      const response = createSampleResponse(
        'The accuracy rate is 95.5% which is significant. This demonstrates clear improvement over baseline.'
      );

      const result = await extractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      // Should not split on the decimal point
      expect(keyPoints!.some((kp) => kp.includes('95.5%'))).toBe(true);
    });

    it('should handle reasoning with only short sentences', async () => {
      const response = createSampleResponse('Short text. More short. Brief.');

      const result = await extractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBe(1);
      // Should fall back to truncating the entire text
      expect(keyPoints![0]).toContain('Short text');
    });
  });

  describe('Malformed JSON handling', () => {
    it('should handle malformed JSON by falling back to rule-based extraction', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const malformedExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      // Create mock agent that returns malformed JSON (missing closing brackets)
      const mockAgent = createMockAgent('malformed-agent', 'anthropic', {
        position: '{"keyPoints": ["Point 1", "Point 2"', // Missing closing bracket and array end
        reasoning: 'Some reasoning',
      });
      freshRegistry.registerProvider('anthropic', () => mockAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'malformed-agent',
        name: 'Malformed Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse(
        '1. Original point one from input.\n2. Original point two from input.'
      );

      const result = await malformedExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
      // Either jsonrepair fixes the JSON and returns AI key points,
      // or it falls back to rule-based extraction from original reasoning.
      // Both are acceptable outcomes for malformed JSON.
      const hasAIPoints = keyPoints!.some((kp) => kp === 'Point 1' || kp === 'Point 2');
      const hasOriginalPoints = keyPoints!.some((kp) => kp.includes('Original point'));
      expect(hasAIPoints || hasOriginalPoints).toBe(true);
    });

    it('should fall back to rule-based when JSON is completely invalid', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const invalidExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      // Use completely invalid JSON that jsonrepair cannot fix
      const invalidAgent = createMockAgent('invalid-agent', 'openai', {
        position: 'not json at all {{{{',
        reasoning: 'also not json ]]]]',
      });
      freshRegistry.registerProvider('openai', () => invalidAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'invalid-agent',
        name: 'Invalid Agent',
        provider: 'openai',
        model: 'test-model',
      });

      const response = createSampleResponse(
        '1. This is the original first point.\n2. This is the original second point.'
      );

      const result = await invalidExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
      // Should fall back to extracting from original reasoning
      expect(keyPoints!.some((kp) => kp.includes('original'))).toBe(true);
    });

    it('should handle JSON with wrong structure', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const wrongStructureExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      const wrongStructureAgent = createMockAgent('wrong-structure', 'google', {
        position: JSON.stringify({ points: ['Not keyPoints'] }),
        reasoning: JSON.stringify({ data: 'wrong' }),
      });
      freshRegistry.registerProvider('google', () => wrongStructureAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'wrong-structure',
        name: 'Wrong Structure Agent',
        provider: 'google',
        model: 'test-model',
      });

      const response = createSampleResponse(
        '1. First point from original reasoning.\n2. Second point from original reasoning.'
      );

      const result = await wrongStructureExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
      // Should fall back to original reasoning
      expect(keyPoints!.some((kp) => kp.includes('original'))).toBe(true);
    });

    it('should extract JSON from reasoning field when position has no JSON', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const reasoningJsonExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      const reasoningJsonAgent = createMockAgent('reasoning-json', 'anthropic', {
        position: 'Plain text position with no JSON',
        reasoning: 'Some text then {"keyPoints": ["Point from reasoning"]} more text',
      });
      freshRegistry.registerProvider('anthropic', () => reasoningJsonAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'reasoning-json',
        name: 'Reasoning JSON Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse('1. Original point for fallback.');

      const result = await reasoningJsonExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
      // Should extract from reasoning field's JSON
      expect(keyPoints!.some((kp) => kp.includes('Point from reasoning'))).toBe(true);
    });
  });

  describe('AI agent error handling', () => {
    it('should fall back to rule-based when AI throws error', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const errorExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      const errorAgent = createErrorAgent('error-agent', 'anthropic', 'API rate limit exceeded');
      freshRegistry.registerProvider('anthropic', () => errorAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'error-agent',
        name: 'Error Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse(
        '1. Important point from original text.\n2. Another key insight from original.'
      );

      const result = await errorExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeGreaterThan(0);
      // Should fall back to original reasoning
      expect(keyPoints!.some((kp) => kp.includes('original'))).toBe(true);
    });

    it('should return empty array when AI fails and fallback is disabled', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const noFallbackExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: false,
      });

      const errorAgent = createErrorAgent('error-agent-2', 'anthropic', 'Network error');
      freshRegistry.registerProvider('anthropic', () => errorAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'error-agent-2',
        name: 'Error Agent 2',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse(
        '1. Point that should not be extracted.\n2. Another point.'
      );

      const result = await noFallbackExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBe(0);
    });

    it('should handle multiple responses with partial failures', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const partialFailureExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      // Create one working agent
      const workingAgent = createMockAgent('working', 'anthropic', {
        position: JSON.stringify({ keyPoints: ['AI extracted point'] }),
      });

      freshRegistry.registerProvider('anthropic', () => workingAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'working-agent',
        name: 'Working Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response1 = createSampleResponse('1. First response point.', { agentId: 'agent-1' });
      const response2 = createSampleResponse('1. Second response point.', { agentId: 'agent-2' });

      const result = await partialFailureExtractor.extractKeyPointsBatch([response1, response2]);

      expect(result.size).toBe(2);
      expect(result.get('agent-1')).toBeDefined();
      expect(result.get('agent-2')).toBeDefined();
    });
  });

  describe('extractKeyPoints (single response)', () => {
    it('should extract key points from a single response', async () => {
      const response = createSampleResponse(
        '1. Single response point one.\n2. Single response point two.'
      );

      const keyPoints = await extractor.extractKeyPoints(response);

      expect(keyPoints).toBeDefined();
      expect(keyPoints.length).toBeGreaterThan(0);
      expect(keyPoints.some((kp) => kp.includes('Single response'))).toBe(true);
    });

    it('should return empty array for response with no extractable content', async () => {
      const noFallbackExtractor = new KeyPointsExtractor({
        registry,
        fallbackToRuleBased: false,
      });

      const response = createSampleResponse('x');

      const keyPoints = await noFallbackExtractor.extractKeyPoints(response);

      // No AI agent available and fallback disabled
      expect(keyPoints).toEqual([]);
    });
  });

  describe('maxKeyPoints configuration', () => {
    it('should respect maxKeyPoints limit', async () => {
      // Use a fresh registry without AI agent to test rule-based extraction limit
      const freshRegistry = new AgentRegistry();
      const limitedExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        maxKeyPoints: 2,
        fallbackToRuleBased: true,
      });

      const response = createSampleResponse(
        '1. First important point here.\n2. Second important point here.\n3. Third important point here.\n4. Fourth important point here.'
      );

      const result = await limitedExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeLessThanOrEqual(2);
    });

    it('should limit AI-extracted key points to maxKeyPoints', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const limitedExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        maxKeyPoints: 2,
        fallbackToRuleBased: true,
      });

      const manyPointsAgent = createMockAgent('many-points', 'anthropic', {
        position: JSON.stringify({
          keyPoints: ['Point 1', 'Point 2', 'Point 3', 'Point 4', 'Point 5'],
        }),
      });
      freshRegistry.registerProvider('anthropic', () => manyPointsAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'many-points',
        name: 'Many Points Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse('Reasoning text.');

      const result = await limitedExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBeLessThanOrEqual(2);
    });
  });

  describe('preferredProvider configuration', () => {
    it('should use preferred provider when available', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const preferredExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        preferredProvider: 'google',
        fallbackToRuleBased: true,
      });

      const anthropicAgent = createMockAgent('anthropic-agent', 'anthropic', {
        position: JSON.stringify({ keyPoints: ['Anthropic point'] }),
      });
      const googleAgent = createMockAgent('google-agent', 'google', {
        position: JSON.stringify({ keyPoints: ['Google point'] }),
      });

      freshRegistry.registerProvider('anthropic', () => anthropicAgent as any, 'test-model');
      freshRegistry.registerProvider('google', () => googleAgent as any, 'test-model');

      freshRegistry.createAgent({
        id: 'anthropic-agent',
        name: 'Anthropic Agent',
        provider: 'anthropic',
        model: 'test-model',
      });
      freshRegistry.createAgent({
        id: 'google-agent',
        name: 'Google Agent',
        provider: 'google',
        model: 'test-model',
      });

      const response = createSampleResponse('Test reasoning.');

      const result = await preferredExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      // Should use Google agent (preferred)
      expect(keyPoints!.some((kp) => kp.includes('Google point'))).toBe(true);
    });

    it('should fall back to first available when preferred not available', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const preferredExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        preferredProvider: 'perplexity', // Not registered
        fallbackToRuleBased: true,
      });

      const anthropicAgent = createMockAgent('anthropic-agent', 'anthropic', {
        position: JSON.stringify({ keyPoints: ['Anthropic fallback point'] }),
      });

      freshRegistry.registerProvider('anthropic', () => anthropicAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'anthropic-agent',
        name: 'Anthropic Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse('Test reasoning.');

      const result = await preferredExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      // Should fall back to anthropic
      expect(keyPoints!.some((kp) => kp.includes('Anthropic fallback'))).toBe(true);
    });
  });

  describe('edge cases for AI key points parsing', () => {
    it('should trim whitespace from key points', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const whitespaceExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      const whitespaceAgent = createMockAgent('whitespace', 'anthropic', {
        position: JSON.stringify({
          keyPoints: [
            '  Point with leading spaces  ',
            '\nPoint with newlines\n',
            '\tTabbed point\t',
          ],
        }),
      });
      freshRegistry.registerProvider('anthropic', () => whitespaceAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'whitespace',
        name: 'Whitespace Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse('Original reasoning.');

      const result = await whitespaceExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      // All points should be trimmed
      for (const kp of keyPoints!) {
        expect(kp).toBe(kp.trim());
        expect(kp.startsWith(' ')).toBe(false);
        expect(kp.endsWith(' ')).toBe(false);
      }
    });

    it('should filter out empty string key points', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const emptyPointsExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      const emptyPointsAgent = createMockAgent('empty-points', 'anthropic', {
        position: JSON.stringify({
          keyPoints: ['Valid point', '', '   ', 'Another valid point'],
        }),
      });
      freshRegistry.registerProvider('anthropic', () => emptyPointsAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'empty-points',
        name: 'Empty Points Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse('Original reasoning.');

      const result = await emptyPointsExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      expect(keyPoints!.length).toBe(2);
      expect(keyPoints!).toContain('Valid point');
      expect(keyPoints!).toContain('Another valid point');
    });

    it('should convert non-string key points to strings', async () => {
      // Create a fresh registry and extractor for this test
      const freshRegistry = new AgentRegistry();
      const mixedTypesExtractor = new KeyPointsExtractor({
        registry: freshRegistry,
        fallbackToRuleBased: true,
      });

      const mixedTypesAgent = createMockAgent('mixed-types', 'anthropic', {
        position: JSON.stringify({
          keyPoints: ['String point', 123, true, { nested: 'object' }],
        }),
      });
      freshRegistry.registerProvider('anthropic', () => mixedTypesAgent as any, 'test-model');
      freshRegistry.createAgent({
        id: 'mixed-types',
        name: 'Mixed Types Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const response = createSampleResponse('Original reasoning.');

      const result = await mixedTypesExtractor.extractKeyPointsBatch([response]);
      const keyPoints = result.get('test-agent');

      expect(keyPoints).toBeDefined();
      // Should have converted all to strings
      for (const kp of keyPoints!) {
        expect(typeof kp).toBe('string');
      }
    });
  });
});
