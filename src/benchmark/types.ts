/**
 * Benchmark Framework Types
 *
 * Type definitions for measuring debate performance and quality.
 */

import type { DebateMode, AgentResponse } from '../types/index.js';

// ============================================
// Metrics Types
// ============================================

/**
 * Latency metrics for performance measurement
 */
export interface LatencyMetrics {
  /** Total execution time in milliseconds */
  totalMs: number;
  /** Execution time per round in milliseconds */
  perRoundMs: number[];
  /** Execution time per agent in milliseconds */
  perAgentMs: Record<string, number>;
}

/**
 * Interaction quality metrics
 * Measures how well agents engage with each other
 */
export interface InteractionMetrics {
  /** How often agents reference each other's positions or arguments */
  crossReferenceCount: number;
  /** Levels of argument-counterargument chains */
  rebuttalDepth: number;
  /** Number of question-response pairs (primarily for socratic mode) */
  questionResponsePairs: number;
}

/**
 * Content quality metrics
 * Measures the quality of individual responses
 */
export interface ContentMetrics {
  /** Average confidence across all responses */
  avgConfidence: number;
  /** Variance in confidence (high variance may indicate healthy debate) */
  confidenceVariance: number;
  /** Number of tool calls per agent */
  toolCallsPerAgent: Record<string, number>;
  /** Total number of citations across all responses */
  citationCount: number;
}

/**
 * Consensus quality metrics
 * Measures the quality and timing of consensus formation
 */
export interface ConsensusMetrics {
  /** Final agreement level (0-1) */
  agreementLevel: number;
  /** Round number when positions stabilized (null if never stabilized) */
  convergenceRound: number | null;
  /** Warning flag for potential groupthink (too early/strong consensus) */
  groupthinkWarning: boolean;
}

/**
 * Complete benchmark metrics
 * Aggregates all metric categories
 */
export interface BenchmarkMetrics {
  /** Performance metrics */
  latency: LatencyMetrics;
  /** Interaction quality metrics */
  interaction: InteractionMetrics;
  /** Content quality metrics */
  content: ContentMetrics;
  /** Consensus quality metrics */
  consensus: ConsensusMetrics;
}

// ============================================
// Scenario Types
// ============================================

/**
 * Benchmark scenario definition
 * Defines a specific test configuration
 */
export interface BenchmarkScenario {
  /** Unique name for this scenario */
  name: string;
  /** Debate topic */
  topic: string;
  /** Debate mode */
  mode: DebateMode;
  /** List of agent IDs to use */
  agents: string[];
  /** Number of rounds to execute */
  rounds: number;
}

/**
 * Result of a single benchmark run
 */
export interface BenchmarkResult {
  /** Scenario that was executed */
  scenario: BenchmarkScenario;
  /** Collected metrics */
  metrics: BenchmarkMetrics;
  /** All responses collected during the benchmark */
  responses: AgentResponse[];
  /** Timestamp when the benchmark was run */
  timestamp: Date;
  /** Whether the benchmark completed successfully */
  success: boolean;
  /** Error message if benchmark failed */
  error?: string;
}

// ============================================
// Comparison Types
// ============================================

/**
 * Recommendation for feature flag adoption
 */
export type AdoptionRecommendation = 'adopt' | 'reject' | 'conditional';

/**
 * Delta metrics showing percentage changes
 */
export interface BenchmarkDelta {
  /** Percentage reduction in latency (positive = faster) */
  latencyReduction: number;
  /** Percentage change in interaction quality (positive = better) */
  interactionChange: number;
  /** Composite quality score (0-100, higher = better) */
  qualityScore: number;
}

/**
 * Comparison between baseline and variant benchmark results
 */
export interface BenchmarkComparison {
  /** Baseline metrics (without feature flag changes) */
  baseline: BenchmarkMetrics;
  /** Variant metrics (with feature flag changes) */
  variant: BenchmarkMetrics;
  /** Calculated deltas */
  delta: BenchmarkDelta;
  /** Adoption recommendation */
  recommendation: AdoptionRecommendation;
  /** Conditions for adoption (when recommendation is 'conditional') */
  conditions?: string[];
}

// ============================================
// Collector Types
// ============================================

/**
 * Timing event for tracking execution
 */
export interface TimingEvent {
  /** Type of event */
  type: 'round_start' | 'round_end' | 'agent_start' | 'agent_end';
  /** Timestamp of the event */
  timestamp: number;
  /** Round number (if applicable) */
  round?: number;
  /** Agent ID (if applicable) */
  agentId?: string;
}

/**
 * Cross-reference detected between agents
 */
export interface CrossReference {
  /** Source agent ID */
  sourceAgentId: string;
  /** Target agent ID (the agent being referenced) */
  targetAgentId: string;
  /** Round number when the reference occurred */
  round: number;
}

/**
 * Configuration for MetricsCollector
 */
export interface MetricsCollectorConfig {
  /** Session ID being tracked */
  sessionId: string;
  /** Total rounds expected */
  totalRounds: number;
  /** Groupthink detection threshold (0-1) */
  groupthinkThreshold?: number;
  /** Minimum rounds before checking for convergence */
  minConvergenceRounds?: number;
}

// ============================================
// Runner Types
// ============================================

/**
 * Configuration for BenchmarkRunner
 */
export interface BenchmarkRunnerConfig {
  /** Number of times to repeat each scenario for statistical significance */
  repetitions?: number;
  /** Timeout per scenario in milliseconds */
  timeoutMs?: number;
  /** Whether to run scenarios in parallel */
  parallel?: boolean;
}

/**
 * Aggregated results from multiple benchmark runs
 */
export interface AggregatedBenchmarkResult {
  /** Scenario that was run */
  scenario: BenchmarkScenario;
  /** Number of successful runs */
  successCount: number;
  /** Number of failed runs */
  failureCount: number;
  /** Average metrics across all successful runs */
  avgMetrics: BenchmarkMetrics;
  /** Standard deviation of key metrics */
  stdDev: {
    latencyMs: number;
    agreementLevel: number;
    interactionScore: number;
  };
}
