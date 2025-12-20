/**
 * Unit tests for Context Processors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AnonymizationProcessor,
  StatisticsProcessor,
  ProcessorChain,
  createAnonymizationProcessor,
  createStatisticsProcessor,
  createProcessorChain,
  type ContextProcessor,
} from '../../../../src/modes/processors/index.js';
import type { AgentResponse, DebateContext, Stance } from '../../../../src/types/index.js';

// ============================================
// Test Fixtures
// ============================================

function createMockResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    agentId: 'agent-1',
    agentName: 'Claude',
    position: 'Test position statement.',
    reasoning: 'Test reasoning',
    confidence: 0.8,
    timestamp: new Date(),
    ...overrides,
  };
}

function createMockContext(overrides: Partial<DebateContext> = {}): DebateContext {
  return {
    sessionId: 'session-1',
    topic: 'Test topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
    ...overrides,
  };
}

// ============================================
// AnonymizationProcessor Tests
// ============================================

describe('AnonymizationProcessor', () => {
  let processor: AnonymizationProcessor;

  beforeEach(() => {
    processor = new AnonymizationProcessor();
  });

  it('should have correct name', () => {
    expect(processor.name).toBe('anonymization');
  });

  it('should return unchanged context when no previous responses', () => {
    const context = createMockContext({ previousResponses: [] });
    const result = processor.process(context);

    expect(result).toEqual(context);
    expect(result.previousResponses).toHaveLength(0);
  });

  it('should anonymize single response', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ agentId: 'claude-1', agentName: 'Claude' }),
      ],
    });

    const result = processor.process(context);

    expect(result.previousResponses).toHaveLength(1);
    expect(result.previousResponses[0].agentId).toBe('participant-1');
    expect(result.previousResponses[0].agentName).toBe('Participant 1');
  });

  it('should anonymize multiple responses with sequential numbering', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ agentId: 'claude-1', agentName: 'Claude' }),
        createMockResponse({ agentId: 'gpt-1', agentName: 'ChatGPT' }),
        createMockResponse({ agentId: 'gemini-1', agentName: 'Gemini' }),
      ],
    });

    const result = processor.process(context);

    expect(result.previousResponses).toHaveLength(3);
    expect(result.previousResponses[0].agentId).toBe('participant-1');
    expect(result.previousResponses[0].agentName).toBe('Participant 1');
    expect(result.previousResponses[1].agentId).toBe('participant-2');
    expect(result.previousResponses[1].agentName).toBe('Participant 2');
    expect(result.previousResponses[2].agentId).toBe('participant-3');
    expect(result.previousResponses[2].agentName).toBe('Participant 3');
  });

  it('should preserve other response fields', () => {
    const originalResponse = createMockResponse({
      agentId: 'claude-1',
      agentName: 'Claude',
      position: 'Important position',
      reasoning: 'Detailed reasoning',
      confidence: 0.95,
      stance: 'YES',
      citations: [{ title: 'Source', url: 'https://example.com' }],
    });

    const context = createMockContext({
      previousResponses: [originalResponse],
    });

    const result = processor.process(context);

    expect(result.previousResponses[0].position).toBe('Important position');
    expect(result.previousResponses[0].reasoning).toBe('Detailed reasoning');
    expect(result.previousResponses[0].confidence).toBe(0.95);
    expect(result.previousResponses[0].stance).toBe('YES');
    expect(result.previousResponses[0].citations).toHaveLength(1);
  });

  it('should not mutate original context', () => {
    const originalResponse = createMockResponse({ agentId: 'claude-1', agentName: 'Claude' });
    const context = createMockContext({
      previousResponses: [originalResponse],
    });

    const result = processor.process(context);

    expect(context.previousResponses[0].agentId).toBe('claude-1');
    expect(context.previousResponses[0].agentName).toBe('Claude');
    expect(result).not.toBe(context);
  });

  it('should preserve other context fields', () => {
    const context = createMockContext({
      sessionId: 'test-session',
      topic: 'Test topic',
      mode: 'delphi',
      currentRound: 2,
      totalRounds: 5,
      focusQuestion: 'What is the best approach?',
      modePrompt: 'Existing prompt',
      previousResponses: [createMockResponse({ agentId: 'claude-1' })],
    });

    const result = processor.process(context);

    expect(result.sessionId).toBe('test-session');
    expect(result.topic).toBe('Test topic');
    expect(result.mode).toBe('delphi');
    expect(result.currentRound).toBe(2);
    expect(result.totalRounds).toBe(5);
    expect(result.focusQuestion).toBe('What is the best approach?');
    expect(result.modePrompt).toBe('Existing prompt');
  });
});

// ============================================
// StatisticsProcessor Tests
// ============================================

describe('StatisticsProcessor', () => {
  let processor: StatisticsProcessor;

  beforeEach(() => {
    processor = new StatisticsProcessor();
  });

  it('should have correct name', () => {
    expect(processor.name).toBe('statistics');
  });

  it('should return unchanged context when no previous responses', () => {
    const context = createMockContext({ previousResponses: [] });
    const result = processor.process(context);

    expect(result).toEqual(context);
  });

  it('should inject statistics into modePrompt', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ confidence: 0.8, position: 'Position A is correct.' }),
        createMockResponse({ confidence: 0.6, position: 'Position B is better.' }),
      ],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('Round Statistics:');
    expect(result.modePrompt).toContain('Participants: 2');
    expect(result.modePrompt).toContain('Average Confidence: 70.0%');
  });

  it('should append to existing modePrompt', () => {
    const context = createMockContext({
      modePrompt: 'Existing mode prompt text.',
      previousResponses: [createMockResponse({ confidence: 0.9 })],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('Existing mode prompt text.');
    expect(result.modePrompt).toContain('Round Statistics:');
  });

  it('should handle undefined modePrompt', () => {
    const context = createMockContext({
      modePrompt: undefined,
      previousResponses: [createMockResponse({ confidence: 0.8 })],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('Round Statistics:');
    expect(result.modePrompt).toContain('Average Confidence: 80.0%');
  });

  it('should calculate correct average confidence', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ confidence: 1.0 }),
        createMockResponse({ confidence: 0.5 }),
        createMockResponse({ confidence: 0.5 }),
      ],
    });

    const result = processor.process(context);

    // Average of 1.0, 0.5, 0.5 = 2.0/3 = 0.667 = 66.7%
    expect(result.modePrompt).toContain('Average Confidence: 66.7%');
  });

  it('should include stance distribution when stances present', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ stance: 'YES' }),
        createMockResponse({ stance: 'YES' }),
        createMockResponse({ stance: 'NO' }),
        createMockResponse({ stance: 'NEUTRAL' }),
      ],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('Stance Distribution:');
    expect(result.modePrompt).toContain('YES=2');
    expect(result.modePrompt).toContain('NO=1');
    expect(result.modePrompt).toContain('NEUTRAL=1');
  });

  it('should not include stance distribution when no stances', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ stance: undefined }),
        createMockResponse({ stance: undefined }),
      ],
    });

    const result = processor.process(context);

    expect(result.modePrompt).not.toContain('Stance Distribution:');
  });

  it('should calculate position distribution', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ position: 'AI is beneficial.' }),
        createMockResponse({ position: 'AI is beneficial.' }),
        createMockResponse({ position: 'AI has risks.' }),
      ],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('Position Distribution:');
    expect(result.modePrompt).toContain('2 participant(s): "AI is beneficial"');
    expect(result.modePrompt).toContain('1 participant(s): "AI has risks"');
  });

  it('should calculate consensus level correctly', () => {
    // 3 out of 4 have same position = 75% consensus
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ position: 'Same position.' }),
        createMockResponse({ position: 'Same position.' }),
        createMockResponse({ position: 'Same position.' }),
        createMockResponse({ position: 'Different position.' }),
      ],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('Consensus Level: 75.0%');
  });

  it('should handle empty positions gracefully', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ position: '' }),
        createMockResponse({ position: '   ' }),
      ],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('Position Distribution:');
    expect(result.modePrompt).toContain('(No position)');
  });

  it('should truncate long positions', () => {
    const longPosition =
      'This is a very long position statement that exceeds one hundred characters and should be truncated for display purposes in the statistics.';
    const context = createMockContext({
      previousResponses: [createMockResponse({ position: longPosition })],
    });

    const result = processor.process(context);

    expect(result.modePrompt).toContain('...');
    // Should not contain the full long position
    expect(result.modePrompt).not.toContain(longPosition);
  });

  it('should not mutate original context', () => {
    const context = createMockContext({
      modePrompt: 'Original prompt',
      previousResponses: [createMockResponse()],
    });

    const result = processor.process(context);

    expect(context.modePrompt).toBe('Original prompt');
    expect(result).not.toBe(context);
  });

  describe('calculateStats', () => {
    it('should return zero values for empty responses', () => {
      const stats = processor.calculateStats([]);

      expect(stats.participantCount).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.consensusLevel).toBe(0);
      expect(stats.stanceDistribution.YES).toBe(0);
      expect(stats.stanceDistribution.NO).toBe(0);
      expect(stats.stanceDistribution.NEUTRAL).toBe(0);
      expect(stats.positionDistribution.size).toBe(0);
    });

    it('should calculate all statistics correctly', () => {
      const responses = [
        createMockResponse({ confidence: 0.9, stance: 'YES', position: 'Position A.' }),
        createMockResponse({ confidence: 0.7, stance: 'NO', position: 'Position B.' }),
        createMockResponse({ confidence: 0.8, stance: 'YES', position: 'Position A.' }),
      ];

      const stats = processor.calculateStats(responses);

      expect(stats.participantCount).toBe(3);
      expect(stats.averageConfidence).toBeCloseTo(80, 0);
      expect(stats.stanceDistribution.YES).toBe(2);
      expect(stats.stanceDistribution.NO).toBe(1);
      expect(stats.stanceDistribution.NEUTRAL).toBe(0);
      expect(stats.positionDistribution.get('Position A')).toBe(2);
      expect(stats.positionDistribution.get('Position B')).toBe(1);
      expect(stats.consensusLevel).toBeCloseTo(66.67, 1);
    });
  });
});

// ============================================
// ProcessorChain Tests
// ============================================

describe('ProcessorChain', () => {
  it('should have correct name', () => {
    const chain = new ProcessorChain([]);
    expect(chain.name).toBe('chain');
  });

  it('should return unchanged context with empty chain', () => {
    const chain = new ProcessorChain([]);
    const context = createMockContext();

    const result = chain.process(context);

    expect(result).toEqual(context);
  });

  it('should apply single processor', () => {
    const mockProcessor: ContextProcessor = {
      name: 'mock',
      process: vi.fn((ctx) => ({ ...ctx, modePrompt: 'modified' })),
    };

    const chain = new ProcessorChain([mockProcessor]);
    const context = createMockContext();

    const result = chain.process(context);

    expect(mockProcessor.process).toHaveBeenCalledWith(context, undefined);
    expect(result.modePrompt).toBe('modified');
  });

  it('should apply processors in order', () => {
    const order: string[] = [];

    const processor1: ContextProcessor = {
      name: 'first',
      process: vi.fn((ctx) => {
        order.push('first');
        return { ...ctx, modePrompt: 'first' };
      }),
    };

    const processor2: ContextProcessor = {
      name: 'second',
      process: vi.fn((ctx) => {
        order.push('second');
        return { ...ctx, modePrompt: ctx.modePrompt + '-second' };
      }),
    };

    const chain = new ProcessorChain([processor1, processor2]);
    const context = createMockContext();

    const result = chain.process(context);

    expect(order).toEqual(['first', 'second']);
    expect(result.modePrompt).toBe('first-second');
  });

  it('should pass output of one processor as input to next', () => {
    const processor1: ContextProcessor = {
      name: 'first',
      process: (ctx) => ({
        ...ctx,
        previousResponses: [
          createMockResponse({ agentId: 'added-by-first', agentName: 'Added' }),
        ],
      }),
    };

    const processor2: ContextProcessor = {
      name: 'second',
      process: vi.fn((ctx) => ctx),
    };

    const chain = new ProcessorChain([processor1, processor2]);
    const context = createMockContext({ previousResponses: [] });

    chain.process(context);

    expect(processor2.process).toHaveBeenCalledWith(
      expect.objectContaining({
        previousResponses: expect.arrayContaining([
          expect.objectContaining({ agentId: 'added-by-first' }),
        ]),
      }),
      undefined
    );
  });

  it('should pass agent to all processors', () => {
    const mockAgent = { id: 'test-agent' } as any;

    const processor1: ContextProcessor = {
      name: 'first',
      process: vi.fn((ctx) => ctx),
    };

    const processor2: ContextProcessor = {
      name: 'second',
      process: vi.fn((ctx) => ctx),
    };

    const chain = new ProcessorChain([processor1, processor2]);
    const context = createMockContext();

    chain.process(context, mockAgent);

    expect(processor1.process).toHaveBeenCalledWith(context, mockAgent);
    expect(processor2.process).toHaveBeenCalledWith(context, mockAgent);
  });

  it('should combine anonymization and statistics processors', () => {
    const context = createMockContext({
      previousResponses: [
        createMockResponse({ agentId: 'claude-1', agentName: 'Claude', confidence: 0.8 }),
        createMockResponse({ agentId: 'gpt-1', agentName: 'ChatGPT', confidence: 0.6 }),
      ],
    });

    const chain = new ProcessorChain([
      new AnonymizationProcessor(),
      new StatisticsProcessor(),
    ]);

    const result = chain.process(context);

    // Check anonymization was applied
    expect(result.previousResponses[0].agentId).toBe('participant-1');
    expect(result.previousResponses[0].agentName).toBe('Participant 1');
    expect(result.previousResponses[1].agentId).toBe('participant-2');
    expect(result.previousResponses[1].agentName).toBe('Participant 2');

    // Check statistics were injected
    expect(result.modePrompt).toContain('Round Statistics:');
    expect(result.modePrompt).toContain('Participants: 2');
    expect(result.modePrompt).toContain('Average Confidence: 70.0%');
  });

  it('should expose processors via getProcessors', () => {
    const processor1 = new AnonymizationProcessor();
    const processor2 = new StatisticsProcessor();

    const chain = new ProcessorChain([processor1, processor2]);

    const processors = chain.getProcessors();

    expect(processors).toHaveLength(2);
    expect(processors[0]).toBe(processor1);
    expect(processors[1]).toBe(processor2);
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe('Factory Functions', () => {
  describe('createAnonymizationProcessor', () => {
    it('should create AnonymizationProcessor instance', () => {
      const processor = createAnonymizationProcessor();

      expect(processor).toBeInstanceOf(AnonymizationProcessor);
      expect(processor.name).toBe('anonymization');
    });
  });

  describe('createStatisticsProcessor', () => {
    it('should create StatisticsProcessor instance', () => {
      const processor = createStatisticsProcessor();

      expect(processor).toBeInstanceOf(StatisticsProcessor);
      expect(processor.name).toBe('statistics');
    });
  });

  describe('createProcessorChain', () => {
    it('should create ProcessorChain instance', () => {
      const chain = createProcessorChain([
        createAnonymizationProcessor(),
        createStatisticsProcessor(),
      ]);

      expect(chain).toBeInstanceOf(ProcessorChain);
      expect(chain.name).toBe('chain');
      expect(chain.getProcessors()).toHaveLength(2);
    });

    it('should create empty chain', () => {
      const chain = createProcessorChain([]);

      expect(chain).toBeInstanceOf(ProcessorChain);
      expect(chain.getProcessors()).toHaveLength(0);
    });
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Processor Integration', () => {
  it('should handle complex debate context', () => {
    const context = createMockContext({
      sessionId: 'integration-test',
      topic: 'AI Safety',
      mode: 'delphi',
      currentRound: 3,
      totalRounds: 5,
      focusQuestion: 'Is AI alignment achievable?',
      modePrompt: 'Initial mode prompt.',
      previousResponses: [
        createMockResponse({
          agentId: 'claude-1',
          agentName: 'Claude',
          position: 'AI alignment is achievable with sufficient research.',
          reasoning: 'Historical progress suggests convergence.',
          confidence: 0.85,
          stance: 'YES',
          citations: [{ title: 'Paper 1', url: 'https://example.com/1' }],
        }),
        createMockResponse({
          agentId: 'gpt-1',
          agentName: 'ChatGPT',
          position: 'AI alignment faces fundamental challenges.',
          reasoning: 'The orthogonality thesis suggests difficulty.',
          confidence: 0.65,
          stance: 'NO',
          citations: [{ title: 'Paper 2', url: 'https://example.com/2' }],
        }),
        createMockResponse({
          agentId: 'gemini-1',
          agentName: 'Gemini',
          position: 'AI alignment is achievable with sufficient research.',
          reasoning: 'Technical progress is promising.',
          confidence: 0.75,
          stance: 'YES',
        }),
      ],
    });

    const chain = createProcessorChain([
      createAnonymizationProcessor(),
      createStatisticsProcessor(),
    ]);

    const result = chain.process(context);

    // Verify all original context fields preserved
    expect(result.sessionId).toBe('integration-test');
    expect(result.topic).toBe('AI Safety');
    expect(result.mode).toBe('delphi');
    expect(result.currentRound).toBe(3);
    expect(result.totalRounds).toBe(5);
    expect(result.focusQuestion).toBe('Is AI alignment achievable?');

    // Verify anonymization
    expect(result.previousResponses[0].agentId).toBe('participant-1');
    expect(result.previousResponses[1].agentId).toBe('participant-2');
    expect(result.previousResponses[2].agentId).toBe('participant-3');

    // Verify response content preserved
    expect(result.previousResponses[0].citations).toHaveLength(1);
    expect(result.previousResponses[0].stance).toBe('YES');

    // Verify statistics
    expect(result.modePrompt).toContain('Initial mode prompt.');
    expect(result.modePrompt).toContain('Participants: 3');
    expect(result.modePrompt).toContain('Average Confidence: 75.0%');
    expect(result.modePrompt).toContain('Stance Distribution:');
    expect(result.modePrompt).toContain('YES=2');
    expect(result.modePrompt).toContain('NO=1');
    expect(result.modePrompt).toContain('Consensus Level: 66.7%');
  });
});
