/**
 * Tests for KeyPointsExtractor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyPointsExtractor } from '../../../src/core/key-points-extractor.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import type { AgentResponse } from '../../../src/types/index.js';

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
      keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
    }),
    reasoning: 'Analysis complete',
    confidence: 0.8,
    timestamp: new Date(),
  }),
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  setToolkit: vi.fn(),
});

// Sample response for testing
const createSampleResponse = (reasoning: string): AgentResponse => ({
  agentId: 'test-agent',
  agentName: 'Test Agent',
  position: 'Test position statement',
  reasoning,
  confidence: 0.85,
  timestamp: new Date(),
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
  });
});
