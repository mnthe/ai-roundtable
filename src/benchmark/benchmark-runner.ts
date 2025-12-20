/**
 * Benchmark Runner
 *
 * Executes benchmark scenarios and compares results for feature flag evaluation.
 */

import type {
  BenchmarkScenario,
  BenchmarkResult,
  BenchmarkComparison,
  BenchmarkMetrics,
  BenchmarkDelta,
  BenchmarkRunnerConfig,
  AggregatedBenchmarkResult,
  AdoptionRecommendation,
} from './types.js';
import { MetricsCollector } from './metrics-collector.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BenchmarkRunner');

// Default configuration
const DEFAULT_REPETITIONS = 1;
const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes

// Thresholds for recommendation
const QUALITY_THRESHOLD_ADOPT = 60;
const QUALITY_THRESHOLD_REJECT = 30;
const LATENCY_IMPROVEMENT_THRESHOLD = 10; // 10% improvement

/**
 * Function type for scenario execution
 * Must be provided by the caller to execute actual debate rounds
 */
export type ScenarioExecutor = (
  scenario: BenchmarkScenario,
  collector: MetricsCollector
) => Promise<void>;

/**
 * BenchmarkRunner
 *
 * Runs benchmark scenarios and compares baseline vs variant results.
 */
export class BenchmarkRunner {
  private readonly config: Required<BenchmarkRunnerConfig>;
  private readonly executor: ScenarioExecutor;

  constructor(executor: ScenarioExecutor, config?: BenchmarkRunnerConfig) {
    this.executor = executor;
    this.config = {
      repetitions: config?.repetitions ?? DEFAULT_REPETITIONS,
      timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      parallel: config?.parallel ?? false,
    };
  }

  // ============================================
  // Scenario Execution
  // ============================================

  /**
   * Run a single benchmark scenario
   */
  async runScenario(scenario: BenchmarkScenario): Promise<BenchmarkResult> {
    const collector = new MetricsCollector({
      sessionId: `benchmark-${scenario.name}-${Date.now()}`,
      totalRounds: scenario.rounds,
    });

    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      // Execute with timeout
      await Promise.race([
        this.executor(scenario, collector),
        this.createTimeout(this.config.timeoutMs),
      ]);
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      logger.error({ err, scenario: scenario.name }, 'Scenario execution failed');
    }

    const metrics = collector.getMetrics();
    const duration = Date.now() - startTime;

    logger.info(
      {
        scenario: scenario.name,
        success,
        durationMs: duration,
        agreementLevel: metrics.consensus.agreementLevel,
      },
      'Scenario completed'
    );

    return {
      scenario,
      metrics,
      responses: collector.getResponses(),
      timestamp: new Date(),
      success,
      error,
    };
  }

  /**
   * Run a scenario multiple times and aggregate results
   */
  async runScenarioWithRepetitions(
    scenario: BenchmarkScenario
  ): Promise<AggregatedBenchmarkResult> {
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < this.config.repetitions; i++) {
      const result = await this.runScenario(scenario);
      results.push(result);
    }

    return this.aggregateResults(scenario, results);
  }

  /**
   * Run multiple scenarios
   */
  async runScenarios(scenarios: BenchmarkScenario[]): Promise<BenchmarkResult[]> {
    if (this.config.parallel) {
      return Promise.all(scenarios.map((s) => this.runScenario(s)));
    }

    const results: BenchmarkResult[] = [];
    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);
    }
    return results;
  }

  // ============================================
  // Comparison Methods
  // ============================================

  /**
   * Compare baseline and variant benchmark results
   */
  compare(baseline: BenchmarkMetrics, variant: BenchmarkMetrics): BenchmarkComparison {
    const delta = this.calculateDelta(baseline, variant);
    const { recommendation, conditions } = this.determineRecommendation(delta, baseline, variant);

    return {
      baseline,
      variant,
      delta,
      recommendation,
      conditions,
    };
  }

  /**
   * Run comparison between two scenarios
   */
  async compareScenarios(
    baselineScenario: BenchmarkScenario,
    variantScenario: BenchmarkScenario
  ): Promise<{
    baseline: BenchmarkResult;
    variant: BenchmarkResult;
    comparison: BenchmarkComparison;
  }> {
    const baseline = await this.runScenario(baselineScenario);
    const variant = await this.runScenario(variantScenario);

    const comparison = this.compare(baseline.metrics, variant.metrics);

    return { baseline, variant, comparison };
  }

  // ============================================
  // Delta Calculation
  // ============================================

  /**
   * Calculate delta between baseline and variant metrics
   */
  calculateDelta(baseline: BenchmarkMetrics, variant: BenchmarkMetrics): BenchmarkDelta {
    const latencyReduction = this.calculatePercentageChange(
      baseline.latency.totalMs,
      variant.latency.totalMs,
      true // Inverted: less is better
    );

    const interactionChange = this.calculateInteractionChange(baseline, variant);
    const qualityScore = this.calculateQualityScore(baseline, variant);

    return {
      latencyReduction,
      interactionChange,
      qualityScore,
    };
  }

  /**
   * Calculate percentage change
   * @param baseline - Baseline value
   * @param variant - Variant value
   * @param inverted - If true, reduction is positive (for metrics where lower is better)
   */
  private calculatePercentageChange(
    baseline: number,
    variant: number,
    inverted = false
  ): number {
    if (baseline === 0) return variant === 0 ? 0 : (inverted ? -100 : 100);

    const change = ((baseline - variant) / baseline) * 100;
    return inverted ? change : -change;
  }

  /**
   * Calculate interaction quality change
   */
  private calculateInteractionChange(
    baseline: BenchmarkMetrics,
    variant: BenchmarkMetrics
  ): number {
    // Composite interaction score
    const baselineScore =
      baseline.interaction.crossReferenceCount * 2 +
      baseline.interaction.rebuttalDepth * 3 +
      baseline.interaction.questionResponsePairs;

    const variantScore =
      variant.interaction.crossReferenceCount * 2 +
      variant.interaction.rebuttalDepth * 3 +
      variant.interaction.questionResponsePairs;

    return this.calculatePercentageChange(baselineScore, variantScore);
  }

  /**
   * Calculate composite quality score (0-100)
   */
  private calculateQualityScore(
    baseline: BenchmarkMetrics,
    variant: BenchmarkMetrics
  ): number {
    // Weight different quality aspects
    const weights = {
      confidence: 0.2,
      citations: 0.15,
      interaction: 0.25,
      consensus: 0.25,
      groupthink: 0.15,
    };

    let score = 50; // Start at neutral

    // Confidence improvement
    const confidenceDiff = variant.content.avgConfidence - baseline.content.avgConfidence;
    score += confidenceDiff * 100 * weights.confidence;

    // Citation improvement
    const citationDiff =
      baseline.content.citationCount === 0
        ? variant.content.citationCount > 0
          ? 1
          : 0
        : (variant.content.citationCount - baseline.content.citationCount) /
          baseline.content.citationCount;
    score += citationDiff * 50 * weights.citations;

    // Interaction improvement
    const interactionChange = this.calculateInteractionChange(baseline, variant);
    score += (interactionChange / 100) * 50 * weights.interaction;

    // Consensus improvement (higher is better, unless groupthink)
    const consensusDiff =
      variant.consensus.agreementLevel - baseline.consensus.agreementLevel;
    score += consensusDiff * 50 * weights.consensus;

    // Groupthink penalty
    if (variant.consensus.groupthinkWarning && !baseline.consensus.groupthinkWarning) {
      score -= 20 * weights.groupthink;
    } else if (
      !variant.consensus.groupthinkWarning &&
      baseline.consensus.groupthinkWarning
    ) {
      score += 20 * weights.groupthink;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }

  // ============================================
  // Recommendation Logic
  // ============================================

  /**
   * Determine adoption recommendation based on delta
   */
  private determineRecommendation(
    delta: BenchmarkDelta,
    baseline: BenchmarkMetrics,
    variant: BenchmarkMetrics
  ): { recommendation: AdoptionRecommendation; conditions?: string[] } {
    const conditions: string[] = [];

    // Clear adopt: high quality and good latency
    if (
      delta.qualityScore >= QUALITY_THRESHOLD_ADOPT &&
      delta.latencyReduction >= -LATENCY_IMPROVEMENT_THRESHOLD
    ) {
      return { recommendation: 'adopt' };
    }

    // Clear reject: low quality or significant latency degradation
    if (
      delta.qualityScore < QUALITY_THRESHOLD_REJECT ||
      delta.latencyReduction < -50 // 50% slower
    ) {
      return { recommendation: 'reject' };
    }

    // Conditional cases
    if (delta.qualityScore >= QUALITY_THRESHOLD_REJECT) {
      // Quality is acceptable but not great
      if (delta.latencyReduction < 0) {
        conditions.push(
          `Latency increased by ${Math.abs(delta.latencyReduction).toFixed(1)}% - consider for non-time-critical use cases`
        );
      }

      if (variant.consensus.groupthinkWarning) {
        conditions.push('Groupthink warning detected - monitor for diversity of positions');
      }

      if (delta.interactionChange < 0) {
        conditions.push(
          `Interaction quality decreased by ${Math.abs(delta.interactionChange).toFixed(1)}% - may reduce debate depth`
        );
      }

      // Check if improvement is mode-specific
      if (baseline.interaction.questionResponsePairs > 0 && variant.interaction.questionResponsePairs === 0) {
        conditions.push('Question-response pairs eliminated - not suitable for Socratic mode');
      }

      return { recommendation: 'conditional', conditions };
    }

    return { recommendation: 'reject' };
  }

  // ============================================
  // Aggregation Methods
  // ============================================

  /**
   * Aggregate multiple benchmark results
   */
  private aggregateResults(
    scenario: BenchmarkScenario,
    results: BenchmarkResult[]
  ): AggregatedBenchmarkResult {
    const successfulResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    if (successfulResults.length === 0) {
      // Return empty metrics if all failed
      return {
        scenario,
        successCount: 0,
        failureCount: failedResults.length,
        avgMetrics: this.createEmptyMetrics(),
        stdDev: { latencyMs: 0, agreementLevel: 0, interactionScore: 0 },
      };
    }

    const avgMetrics = this.averageMetrics(successfulResults.map((r) => r.metrics));
    const stdDev = this.calculateStdDev(successfulResults.map((r) => r.metrics));

    return {
      scenario,
      successCount: successfulResults.length,
      failureCount: failedResults.length,
      avgMetrics,
      stdDev,
    };
  }

  /**
   * Average multiple metrics
   */
  private averageMetrics(metrics: BenchmarkMetrics[]): BenchmarkMetrics {
    const n = metrics.length;

    // Average latency
    const avgLatency = {
      totalMs: metrics.reduce((sum, m) => sum + m.latency.totalMs, 0) / n,
      perRoundMs: this.averageArrays(metrics.map((m) => m.latency.perRoundMs)),
      perAgentMs: this.averageRecords(metrics.map((m) => m.latency.perAgentMs)),
    };

    // Average interaction
    const avgInteraction = {
      crossReferenceCount:
        metrics.reduce((sum, m) => sum + m.interaction.crossReferenceCount, 0) / n,
      rebuttalDepth: metrics.reduce((sum, m) => sum + m.interaction.rebuttalDepth, 0) / n,
      questionResponsePairs:
        metrics.reduce((sum, m) => sum + m.interaction.questionResponsePairs, 0) / n,
    };

    // Average content
    const avgContent = {
      avgConfidence: metrics.reduce((sum, m) => sum + m.content.avgConfidence, 0) / n,
      confidenceVariance:
        metrics.reduce((sum, m) => sum + m.content.confidenceVariance, 0) / n,
      toolCallsPerAgent: this.averageRecords(metrics.map((m) => m.content.toolCallsPerAgent)),
      citationCount: metrics.reduce((sum, m) => sum + m.content.citationCount, 0) / n,
    };

    // Average consensus
    const avgConsensus = {
      agreementLevel: metrics.reduce((sum, m) => sum + m.consensus.agreementLevel, 0) / n,
      convergenceRound: this.averageConvergenceRound(metrics),
      groupthinkWarning: metrics.filter((m) => m.consensus.groupthinkWarning).length > n / 2,
    };

    return {
      latency: avgLatency,
      interaction: avgInteraction,
      content: avgContent,
      consensus: avgConsensus,
    };
  }

  /**
   * Average arrays of numbers
   */
  private averageArrays(arrays: number[][]): number[] {
    if (arrays.length === 0) return [];

    const maxLen = Math.max(...arrays.map((a) => a.length));
    const result: number[] = [];

    for (let i = 0; i < maxLen; i++) {
      const values = arrays.filter((a) => i < a.length).map((a) => a[i] ?? 0);
      result.push(values.reduce((sum, v) => sum + v, 0) / values.length);
    }

    return result;
  }

  /**
   * Average records of numbers
   */
  private averageRecords(records: Record<string, number>[]): Record<string, number> {
    if (records.length === 0) return {};

    const allKeys = new Set(records.flatMap((r) => Object.keys(r)));
    const result: Record<string, number> = {};

    for (const key of allKeys) {
      const values = records.filter((r) => key in r).map((r) => r[key] ?? 0);
      result[key] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    return result;
  }

  /**
   * Average convergence round (handling nulls)
   */
  private averageConvergenceRound(metrics: BenchmarkMetrics[]): number | null {
    const nonNullRounds = metrics
      .map((m) => m.consensus.convergenceRound)
      .filter((r): r is number => r !== null);

    if (nonNullRounds.length === 0) return null;
    return Math.round(nonNullRounds.reduce((sum, r) => sum + r, 0) / nonNullRounds.length);
  }

  /**
   * Calculate standard deviation for key metrics
   */
  private calculateStdDev(metrics: BenchmarkMetrics[]): {
    latencyMs: number;
    agreementLevel: number;
    interactionScore: number;
  } {
    const latencies = metrics.map((m) => m.latency.totalMs);
    const agreements = metrics.map((m) => m.consensus.agreementLevel);
    const interactions = metrics.map(
      (m) =>
        m.interaction.crossReferenceCount * 2 +
        m.interaction.rebuttalDepth * 3 +
        m.interaction.questionResponsePairs
    );

    return {
      latencyMs: this.stdDev(latencies),
      agreementLevel: this.stdDev(agreements),
      interactionScore: this.stdDev(interactions),
    };
  }

  /**
   * Calculate standard deviation
   */
  private stdDev(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Create empty metrics
   */
  private createEmptyMetrics(): BenchmarkMetrics {
    return {
      latency: { totalMs: 0, perRoundMs: [], perAgentMs: {} },
      interaction: { crossReferenceCount: 0, rebuttalDepth: 0, questionResponsePairs: 0 },
      content: {
        avgConfidence: 0,
        confidenceVariance: 0,
        toolCallsPerAgent: {},
        citationCount: 0,
      },
      consensus: { agreementLevel: 0, convergenceRound: null, groupthinkWarning: false },
    };
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Benchmark timeout after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Get configuration
   */
  getConfig(): Required<BenchmarkRunnerConfig> {
    return { ...this.config };
  }
}
