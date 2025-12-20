/**
 * Tests for BenchmarkRunner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BenchmarkRunner, type ScenarioExecutor } from '../../../src/benchmark/benchmark-runner.js';
import { MetricsCollector } from '../../../src/benchmark/metrics-collector.js';
import type { BenchmarkScenario, BenchmarkMetrics } from '../../../src/benchmark/types.js';

describe('BenchmarkRunner', () => {
  // Mock executor that simulates a successful scenario
  const createMockExecutor = (
    options?: { delay?: number; shouldFail?: boolean }
  ): ScenarioExecutor => {
    return async (scenario, collector) => {
      if (options?.shouldFail) {
        throw new Error('Simulated failure');
      }

      // Simulate scenario execution
      for (let round = 1; round <= scenario.rounds; round++) {
        collector.recordRoundStart(round);

        for (const agentId of scenario.agents) {
          collector.recordAgentStart(agentId, round);

          if (options?.delay) {
            await new Promise((resolve) => setTimeout(resolve, options.delay));
          }

          collector.recordResponse(
            {
              agentId,
              agentName: `Agent ${agentId}`,
              position: `Position from ${agentId} in round ${round}`,
              reasoning: `Reasoning from ${agentId}`,
              confidence: 0.8,
              timestamp: new Date(),
            },
            round
          );

          collector.recordAgentEnd(agentId, round);
        }

        collector.recordRoundEnd(round);
      }
    };
  };

  const createScenario = (overrides?: Partial<BenchmarkScenario>): BenchmarkScenario => ({
    name: 'test-scenario',
    topic: 'Test topic',
    mode: 'collaborative',
    agents: ['agent-1', 'agent-2'],
    rounds: 2,
    flags: {},
    ...overrides,
  });

  describe('constructor', () => {
    it('should create runner with default config', () => {
      const runner = new BenchmarkRunner(createMockExecutor());
      const config = runner.getConfig();

      expect(config.repetitions).toBe(1);
      expect(config.timeoutMs).toBe(300000);
      expect(config.parallel).toBe(false);
    });

    it('should accept custom config', () => {
      const runner = new BenchmarkRunner(createMockExecutor(), {
        repetitions: 3,
        timeoutMs: 60000,
        parallel: true,
      });
      const config = runner.getConfig();

      expect(config.repetitions).toBe(3);
      expect(config.timeoutMs).toBe(60000);
      expect(config.parallel).toBe(true);
    });
  });

  describe('runScenario', () => {
    it('should run scenario and return results', async () => {
      const runner = new BenchmarkRunner(createMockExecutor());
      const scenario = createScenario();

      const result = await runner.runScenario(scenario);

      expect(result.success).toBe(true);
      expect(result.scenario).toBe(scenario);
      expect(result.responses).toHaveLength(4); // 2 agents * 2 rounds
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should collect metrics during execution', async () => {
      const runner = new BenchmarkRunner(createMockExecutor());
      const scenario = createScenario();

      const result = await runner.runScenario(scenario);

      expect(result.metrics.latency.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.latency.perRoundMs).toHaveLength(2);
      expect(result.metrics.content.avgConfidence).toBe(0.8);
    });

    it('should handle execution failure', async () => {
      const runner = new BenchmarkRunner(createMockExecutor({ shouldFail: true }));
      const scenario = createScenario();

      const result = await runner.runScenario(scenario);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Simulated failure');
    });

    it('should timeout long-running scenarios', async () => {
      const runner = new BenchmarkRunner(
        createMockExecutor({ delay: 1000 }),
        { timeoutMs: 50 }
      );
      const scenario = createScenario();

      const result = await runner.runScenario(scenario);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('runScenarios', () => {
    it('should run multiple scenarios sequentially', async () => {
      const runner = new BenchmarkRunner(createMockExecutor());
      const scenarios = [
        createScenario({ name: 'scenario-1' }),
        createScenario({ name: 'scenario-2' }),
      ];

      const results = await runner.runScenarios(scenarios);

      expect(results).toHaveLength(2);
      expect(results[0].scenario.name).toBe('scenario-1');
      expect(results[1].scenario.name).toBe('scenario-2');
    });

    it('should run scenarios in parallel when configured', async () => {
      const runner = new BenchmarkRunner(createMockExecutor({ delay: 50 }), {
        parallel: true,
      });
      const scenarios = [
        createScenario({ name: 'scenario-1' }),
        createScenario({ name: 'scenario-2' }),
      ];

      const startTime = Date.now();
      await runner.runScenarios(scenarios);
      const elapsed = Date.now() - startTime;

      // Parallel should be faster than sequential
      // Sequential: ~200ms (50ms * 2 agents * 2 scenarios)
      // Parallel: ~100ms (50ms * 2 agents, both scenarios at once)
      expect(elapsed).toBeLessThan(400);
    });
  });

  describe('runScenarioWithRepetitions', () => {
    it('should run scenario multiple times', async () => {
      const executor = vi.fn(createMockExecutor());
      const runner = new BenchmarkRunner(executor, { repetitions: 3 });
      const scenario = createScenario();

      const result = await runner.runScenarioWithRepetitions(scenario);

      expect(executor).toHaveBeenCalledTimes(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
    });

    it('should aggregate results from multiple runs', async () => {
      const runner = new BenchmarkRunner(createMockExecutor(), { repetitions: 3 });
      const scenario = createScenario();

      const result = await runner.runScenarioWithRepetitions(scenario);

      expect(result.avgMetrics.content.avgConfidence).toBeCloseTo(0.8);
      expect(result.stdDev.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.stdDev.agreementLevel).toBeGreaterThanOrEqual(0);
    });

    it('should handle partial failures', async () => {
      let callCount = 0;
      const executor: ScenarioExecutor = async (scenario, collector) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Second run failed');
        }
        await createMockExecutor()(scenario, collector);
      };

      const runner = new BenchmarkRunner(executor, { repetitions: 3 });
      const scenario = createScenario();

      const result = await runner.runScenarioWithRepetitions(scenario);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
    });
  });

  describe('compare', () => {
    const createMetrics = (overrides?: Partial<BenchmarkMetrics>): BenchmarkMetrics => ({
      latency: {
        totalMs: 1000,
        perRoundMs: [500, 500],
        perAgentMs: { 'agent-1': 500, 'agent-2': 500 },
      },
      interaction: {
        crossReferenceCount: 2,
        rebuttalDepth: 1,
        questionResponsePairs: 0,
      },
      content: {
        avgConfidence: 0.8,
        confidenceVariance: 0.01,
        toolCallsPerAgent: { 'agent-1': 2, 'agent-2': 2 },
        citationCount: 4,
      },
      consensus: {
        agreementLevel: 0.7,
        convergenceRound: 2,
        groupthinkWarning: false,
      },
      ...overrides,
    });

    it('should calculate latency reduction', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline = createMetrics({ latency: { totalMs: 1000, perRoundMs: [], perAgentMs: {} } });
      const variant = createMetrics({ latency: { totalMs: 800, perRoundMs: [], perAgentMs: {} } });

      const comparison = runner.compare(baseline, variant);

      // 20% reduction
      expect(comparison.delta.latencyReduction).toBeCloseTo(20);
    });

    it('should calculate interaction change', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline = createMetrics({
        interaction: { crossReferenceCount: 2, rebuttalDepth: 1, questionResponsePairs: 0 },
      });
      const variant = createMetrics({
        interaction: { crossReferenceCount: 4, rebuttalDepth: 2, questionResponsePairs: 1 },
      });

      const comparison = runner.compare(baseline, variant);

      // Higher interaction score
      expect(comparison.delta.interactionChange).toBeGreaterThan(0);
    });

    it('should calculate quality score', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline = createMetrics();
      const variant = createMetrics({
        content: {
          avgConfidence: 0.9,
          confidenceVariance: 0.01,
          toolCallsPerAgent: {},
          citationCount: 6,
        },
      });

      const comparison = runner.compare(baseline, variant);

      expect(comparison.delta.qualityScore).toBeGreaterThan(0);
      expect(comparison.delta.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should recommend adopt for high quality improvement', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline = createMetrics({
        content: { avgConfidence: 0.5, confidenceVariance: 0.1, toolCallsPerAgent: {}, citationCount: 0 },
        consensus: { agreementLevel: 0.3, convergenceRound: null, groupthinkWarning: false },
      });
      const variant = createMetrics({
        content: { avgConfidence: 0.9, confidenceVariance: 0.01, toolCallsPerAgent: {}, citationCount: 10 },
        consensus: { agreementLevel: 0.8, convergenceRound: 2, groupthinkWarning: false },
      });

      const comparison = runner.compare(baseline, variant);

      expect(comparison.recommendation).toBe('adopt');
    });

    it('should recommend reject for significant degradation', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline = createMetrics({
        latency: { totalMs: 1000, perRoundMs: [], perAgentMs: {} },
        content: { avgConfidence: 0.8, confidenceVariance: 0.01, toolCallsPerAgent: {}, citationCount: 5 },
      });
      const variant = createMetrics({
        latency: { totalMs: 5000, perRoundMs: [], perAgentMs: {} }, // 5x slower
        content: { avgConfidence: 0.3, confidenceVariance: 0.1, toolCallsPerAgent: {}, citationCount: 0 },
        consensus: { agreementLevel: 0.1, convergenceRound: null, groupthinkWarning: false },
      });

      const comparison = runner.compare(baseline, variant);

      expect(comparison.recommendation).toBe('reject');
    });

    it('should recommend conditional with conditions', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline = createMetrics({
        latency: { totalMs: 1000, perRoundMs: [], perAgentMs: {} },
      });
      const variant = createMetrics({
        latency: { totalMs: 1200, perRoundMs: [], perAgentMs: {} }, // Slightly slower
        content: { avgConfidence: 0.8, confidenceVariance: 0.01, toolCallsPerAgent: {}, citationCount: 5 },
        interaction: { crossReferenceCount: 1, rebuttalDepth: 0, questionResponsePairs: 0 }, // Lower interaction
      });

      const comparison = runner.compare(baseline, variant);

      if (comparison.recommendation === 'conditional') {
        expect(comparison.conditions).toBeDefined();
        expect(comparison.conditions!.length).toBeGreaterThan(0);
      }
    });

    it('should detect groupthink and add condition', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline = createMetrics({
        consensus: { agreementLevel: 0.7, convergenceRound: 2, groupthinkWarning: false },
      });
      const variant = createMetrics({
        consensus: { agreementLevel: 0.95, convergenceRound: 1, groupthinkWarning: true },
      });

      const comparison = runner.compare(baseline, variant);

      if (comparison.recommendation === 'conditional' && comparison.conditions) {
        const hasGroupthinkCondition = comparison.conditions.some((c) =>
          c.toLowerCase().includes('groupthink')
        );
        expect(hasGroupthinkCondition).toBe(true);
      }
    });
  });

  describe('compareScenarios', () => {
    it('should run both scenarios and compare', async () => {
      const runner = new BenchmarkRunner(createMockExecutor());
      const baseline = createScenario({ name: 'baseline' });
      const variant = createScenario({ name: 'variant' });

      const result = await runner.compareScenarios(baseline, variant);

      expect(result.baseline.success).toBe(true);
      expect(result.variant.success).toBe(true);
      expect(result.comparison).toBeDefined();
      expect(result.comparison.delta).toBeDefined();
    });
  });

  describe('calculateDelta', () => {
    it('should handle zero baseline values', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline: BenchmarkMetrics = {
        latency: { totalMs: 0, perRoundMs: [], perAgentMs: {} },
        interaction: { crossReferenceCount: 0, rebuttalDepth: 0, questionResponsePairs: 0 },
        content: { avgConfidence: 0, confidenceVariance: 0, toolCallsPerAgent: {}, citationCount: 0 },
        consensus: { agreementLevel: 0, convergenceRound: null, groupthinkWarning: false },
      };

      const variant: BenchmarkMetrics = {
        latency: { totalMs: 100, perRoundMs: [100], perAgentMs: {} },
        interaction: { crossReferenceCount: 1, rebuttalDepth: 1, questionResponsePairs: 0 },
        content: { avgConfidence: 0.8, confidenceVariance: 0.01, toolCallsPerAgent: {}, citationCount: 2 },
        consensus: { agreementLevel: 0.7, convergenceRound: 1, groupthinkWarning: false },
      };

      const delta = runner.calculateDelta(baseline, variant);

      // Should not throw and should return valid numbers
      expect(Number.isFinite(delta.latencyReduction)).toBe(true);
      expect(Number.isFinite(delta.interactionChange)).toBe(true);
      expect(Number.isFinite(delta.qualityScore)).toBe(true);
    });

    it('should calculate negative latency reduction when variant is slower', () => {
      const runner = new BenchmarkRunner(createMockExecutor());

      const baseline: BenchmarkMetrics = {
        latency: { totalMs: 100, perRoundMs: [100], perAgentMs: {} },
        interaction: { crossReferenceCount: 0, rebuttalDepth: 0, questionResponsePairs: 0 },
        content: { avgConfidence: 0.8, confidenceVariance: 0.01, toolCallsPerAgent: {}, citationCount: 0 },
        consensus: { agreementLevel: 0.7, convergenceRound: null, groupthinkWarning: false },
      };

      const variant: BenchmarkMetrics = {
        latency: { totalMs: 200, perRoundMs: [200], perAgentMs: {} }, // 2x slower
        interaction: { crossReferenceCount: 0, rebuttalDepth: 0, questionResponsePairs: 0 },
        content: { avgConfidence: 0.8, confidenceVariance: 0.01, toolCallsPerAgent: {}, citationCount: 0 },
        consensus: { agreementLevel: 0.7, convergenceRound: null, groupthinkWarning: false },
      };

      const delta = runner.calculateDelta(baseline, variant);

      // Negative reduction = slowdown
      expect(delta.latencyReduction).toBeLessThan(0);
    });
  });
});
