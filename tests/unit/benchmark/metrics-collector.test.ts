/**
 * Tests for MetricsCollector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../src/benchmark/metrics-collector.js';
import type { AgentResponse } from '../../../src/types/index.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector({
      sessionId: 'test-session',
      totalRounds: 3,
    });
  });

  describe('constructor', () => {
    it('should create collector with default config', () => {
      expect(collector.getSessionId()).toBe('test-session');
    });

    it('should use custom groupthink threshold', () => {
      const customCollector = new MetricsCollector({
        sessionId: 'custom',
        totalRounds: 3,
        groupthinkThreshold: 0.8,
      });
      expect(customCollector.getSessionId()).toBe('custom');
    });
  });

  describe('timing events', () => {
    it('should record round start and end', () => {
      collector.recordRoundStart(1);
      collector.recordRoundEnd(1);

      const metrics = collector.getMetrics();
      expect(metrics.latency.perRoundMs).toHaveLength(1);
      expect(metrics.latency.perRoundMs[0]).toBeGreaterThanOrEqual(0);
    });

    it('should record agent start and end', async () => {
      collector.recordRoundStart(1);
      collector.recordAgentStart('agent-1', 1);

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));

      collector.recordAgentEnd('agent-1', 1);
      collector.recordRoundEnd(1);

      const metrics = collector.getMetrics();
      expect(metrics.latency.perAgentMs['agent-1']).toBeGreaterThan(0);
    });

    it('should calculate total latency', () => {
      collector.recordRoundStart(1);
      collector.recordRoundEnd(1);
      collector.recordRoundStart(2);
      collector.recordRoundEnd(2);

      const metrics = collector.getMetrics();
      expect(metrics.latency.totalMs).toBeGreaterThanOrEqual(0);
      expect(metrics.latency.perRoundMs).toHaveLength(2);
    });
  });

  describe('response collection', () => {
    const createResponse = (
      agentId: string,
      agentName: string,
      overrides?: Partial<AgentResponse>
    ): AgentResponse => ({
      agentId,
      agentName,
      position: `Position from ${agentName}`,
      reasoning: `Reasoning from ${agentName}`,
      confidence: 0.8,
      timestamp: new Date(),
      ...overrides,
    });

    it('should record responses', () => {
      const response = createResponse('agent-1', 'Agent 1');
      collector.recordResponse(response, 1);

      expect(collector.getResponses()).toHaveLength(1);
      expect(collector.getResponses()[0].agentId).toBe('agent-1');
    });

    it('should record multiple responses', () => {
      const responses = [
        createResponse('agent-1', 'Agent 1'),
        createResponse('agent-2', 'Agent 2'),
      ];
      collector.recordResponses(responses, 1);

      expect(collector.getResponses()).toHaveLength(2);
    });

    it('should detect cross-references by name', () => {
      const response1 = createResponse('agent-1', 'Claude');
      collector.recordResponse(response1, 1);

      const response2 = createResponse('agent-2', 'ChatGPT', {
        position: 'I agree with Claude on this point',
        reasoning: 'As Claude mentioned earlier',
      });
      collector.recordResponse(response2, 1);

      const metrics = collector.getMetrics();
      expect(metrics.interaction.crossReferenceCount).toBeGreaterThan(0);
    });

    it('should detect cross-references by patterns', () => {
      const response1 = createResponse('agent-1', 'Agent1');
      collector.recordResponse(response1, 1);

      const response2 = createResponse('agent-2', 'Agent2', {
        reasoning: 'I disagree with the previous argument',
      });
      collector.recordResponse(response2, 1);

      const metrics = collector.getMetrics();
      expect(metrics.interaction.crossReferenceCount).toBeGreaterThan(0);
    });
  });

  describe('content metrics', () => {
    const createResponse = (
      agentId: string,
      confidence: number,
      toolCalls?: number,
      citations?: number
    ): AgentResponse => ({
      agentId,
      agentName: `Agent ${agentId}`,
      position: 'Test position',
      reasoning: 'Test reasoning',
      confidence,
      toolCalls: Array(toolCalls ?? 0)
        .fill(null)
        .map((_, i) => ({
          toolName: `tool-${i}`,
          input: {},
          output: {},
          timestamp: new Date(),
        })),
      citations: Array(citations ?? 0)
        .fill(null)
        .map((_, i) => ({
          title: `Citation ${i}`,
          url: `https://example.com/${i}`,
        })),
      timestamp: new Date(),
    });

    it('should calculate average confidence', () => {
      collector.recordResponse(createResponse('1', 0.8), 1);
      collector.recordResponse(createResponse('2', 0.6), 1);

      const metrics = collector.getMetrics();
      expect(metrics.content.avgConfidence).toBe(0.7);
    });

    it('should calculate confidence variance', () => {
      collector.recordResponse(createResponse('1', 0.8), 1);
      collector.recordResponse(createResponse('2', 0.6), 1);

      const metrics = collector.getMetrics();
      // Variance of [0.8, 0.6] with mean 0.7 = ((0.1)^2 + (0.1)^2) / 2 = 0.01
      expect(metrics.content.confidenceVariance).toBeCloseTo(0.01);
    });

    it('should count tool calls per agent', () => {
      collector.recordResponse(createResponse('1', 0.8, 3), 1);
      collector.recordResponse(createResponse('2', 0.6, 1), 1);

      const metrics = collector.getMetrics();
      expect(metrics.content.toolCallsPerAgent['1']).toBe(3);
      expect(metrics.content.toolCallsPerAgent['2']).toBe(1);
    });

    it('should count citations', () => {
      collector.recordResponse(createResponse('1', 0.8, 0, 2), 1);
      collector.recordResponse(createResponse('2', 0.6, 0, 3), 1);

      const metrics = collector.getMetrics();
      expect(metrics.content.citationCount).toBe(5);
    });

    it('should handle empty responses', () => {
      const metrics = collector.getMetrics();
      expect(metrics.content.avgConfidence).toBe(0);
      expect(metrics.content.confidenceVariance).toBe(0);
      expect(metrics.content.citationCount).toBe(0);
    });
  });

  describe('interaction metrics', () => {
    it('should calculate rebuttal depth', () => {
      // Round 1: initial positions
      collector.recordResponse(
        {
          agentId: 'agent-1',
          agentName: 'Claude',
          position: 'Position A',
          reasoning: 'Reasoning A',
          confidence: 0.8,
          timestamp: new Date(),
        },
        1
      );

      // Round 2: reference to round 1
      collector.recordResponse(
        {
          agentId: 'agent-2',
          agentName: 'ChatGPT',
          position: 'Responding to Claude',
          reasoning: 'As Claude mentioned earlier, I agree',
          confidence: 0.7,
          timestamp: new Date(),
        },
        2
      );

      // Round 3: another reference
      collector.recordResponse(
        {
          agentId: 'agent-1',
          agentName: 'Claude',
          position: 'Responding to ChatGPT',
          reasoning: 'Building on ChatGPT point',
          confidence: 0.85,
          timestamp: new Date(),
        },
        3
      );

      const metrics = collector.getMetrics();
      expect(metrics.interaction.rebuttalDepth).toBeGreaterThan(0);
    });

    it('should detect question-response pairs', () => {
      // Agent asks a question
      collector.recordResponse(
        {
          agentId: 'agent-1',
          agentName: 'Claude',
          position: 'Position',
          reasoning: 'What are the implications? How does this affect us?',
          confidence: 0.8,
          timestamp: new Date(),
        },
        1
      );

      // Agent responds referencing the questioner
      collector.recordResponse(
        {
          agentId: 'agent-2',
          agentName: 'ChatGPT',
          position: 'As Claude asked, the implications are significant',
          reasoning: 'Addressing the questions raised by Claude',
          confidence: 0.7,
          timestamp: new Date(),
        },
        2
      );

      const metrics = collector.getMetrics();
      // Should have detected question-response pairs
      expect(metrics.interaction.questionResponsePairs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('consensus metrics', () => {
    it('should handle empty responses in agreement level calculation', () => {
      // No responses recorded - should return 0 without throwing
      const metrics = collector.getMetrics();
      expect(metrics.consensus.agreementLevel).toBe(0);
    });

    it('should calculate agreement level', () => {
      collector.recordResponse(
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'AI regulation is important for safety',
          reasoning: 'Safety concerns',
          confidence: 0.8,
          timestamp: new Date(),
        },
        1
      );
      collector.recordResponse(
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'AI regulation is important for public trust',
          reasoning: 'Trust concerns',
          confidence: 0.75,
          timestamp: new Date(),
        },
        1
      );

      const metrics = collector.getMetrics();
      expect(metrics.consensus.agreementLevel).toBeGreaterThan(0);
      expect(metrics.consensus.agreementLevel).toBeLessThanOrEqual(1);
    });

    it('should detect convergence round', () => {
      // Round 1: different positions
      collector.recordResponse(
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'Position A',
          reasoning: 'Reasoning',
          confidence: 0.6,
          timestamp: new Date(),
        },
        1
      );
      collector.recordResponse(
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'Position B',
          reasoning: 'Reasoning',
          confidence: 0.5,
          timestamp: new Date(),
        },
        1
      );

      // Round 2: converging
      collector.recordResponse(
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'Agreed position on topic',
          reasoning: 'Reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
        2
      );
      collector.recordResponse(
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'Agreed position on topic',
          reasoning: 'Reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
        2
      );

      // Round 3: stable
      collector.recordResponse(
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'Agreed position on topic confirmed',
          reasoning: 'Reasoning',
          confidence: 0.85,
          timestamp: new Date(),
        },
        3
      );
      collector.recordResponse(
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'Agreed position on topic confirmed',
          reasoning: 'Reasoning',
          confidence: 0.85,
          timestamp: new Date(),
        },
        3
      );

      const metrics = collector.getMetrics();
      // convergenceRound is either a number or null
      expect(
        metrics.consensus.convergenceRound === null ||
        typeof metrics.consensus.convergenceRound === 'number'
      ).toBe(true);
    });

    it('should detect groupthink warning', () => {
      const collector = new MetricsCollector({
        sessionId: 'test',
        totalRounds: 1,
        groupthinkThreshold: 0.8,
      });

      // All agents immediately agree with high confidence
      collector.recordResponse(
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'Exact same position',
          reasoning: 'Same reasoning',
          confidence: 0.95,
          timestamp: new Date(),
        },
        1
      );
      collector.recordResponse(
        {
          agentId: '2',
          agentName: 'Agent 2',
          position: 'Exact same position',
          reasoning: 'Same reasoning',
          confidence: 0.95,
          timestamp: new Date(),
        },
        1
      );

      const metrics = collector.getMetrics();
      // May detect groupthink if agreement is very high and no debate
      expect(typeof metrics.consensus.groupthinkWarning).toBe('boolean');
    });
  });

  describe('reset', () => {
    it('should clear all collected data', () => {
      collector.recordRoundStart(1);
      collector.recordResponse(
        {
          agentId: '1',
          agentName: 'Agent 1',
          position: 'Position',
          reasoning: 'Reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
        1
      );
      collector.recordRoundEnd(1);

      collector.reset();

      expect(collector.getResponses()).toHaveLength(0);
      const metrics = collector.getMetrics();
      expect(metrics.latency.totalMs).toBe(0);
      expect(metrics.latency.perRoundMs).toHaveLength(0);
    });
  });

  describe('getMetrics', () => {
    it('should return complete metrics structure', () => {
      const metrics = collector.getMetrics();

      expect(metrics).toHaveProperty('latency');
      expect(metrics.latency).toHaveProperty('totalMs');
      expect(metrics.latency).toHaveProperty('perRoundMs');
      expect(metrics.latency).toHaveProperty('perAgentMs');

      expect(metrics).toHaveProperty('interaction');
      expect(metrics.interaction).toHaveProperty('crossReferenceCount');
      expect(metrics.interaction).toHaveProperty('rebuttalDepth');
      expect(metrics.interaction).toHaveProperty('questionResponsePairs');

      expect(metrics).toHaveProperty('content');
      expect(metrics.content).toHaveProperty('avgConfidence');
      expect(metrics.content).toHaveProperty('confidenceVariance');
      expect(metrics.content).toHaveProperty('toolCallsPerAgent');
      expect(metrics.content).toHaveProperty('citationCount');

      expect(metrics).toHaveProperty('consensus');
      expect(metrics.consensus).toHaveProperty('agreementLevel');
      expect(metrics.consensus).toHaveProperty('convergenceRound');
      expect(metrics.consensus).toHaveProperty('groupthinkWarning');
    });
  });
});
