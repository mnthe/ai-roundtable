/**
 * Benchmark Framework
 *
 * Provides tools for measuring feature flag impact on quality and performance.
 */

// Types
export type {
  // Metrics types
  BenchmarkMetrics,
  LatencyMetrics,
  InteractionMetrics,
  ContentMetrics,
  ConsensusMetrics,
  // Scenario types
  BenchmarkScenario,
  BenchmarkResult,
  // Comparison types
  BenchmarkComparison,
  BenchmarkDelta,
  AdoptionRecommendation,
  // Collector types
  TimingEvent,
  CrossReference,
  MetricsCollectorConfig,
  // Runner types
  BenchmarkRunnerConfig,
  AggregatedBenchmarkResult,
} from './types.js';

// Classes
export { MetricsCollector } from './metrics-collector.js';
export { BenchmarkRunner, type ScenarioExecutor } from './benchmark-runner.js';
