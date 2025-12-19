/**
 * Benchmark Module
 *
 * Exports for programmatic usage.
 */

export { BenchmarkRunner } from './runner.js';
export { ConfigLoader, generateMatrix } from './config.js';
export { DataCollector } from './collector.js';
export type {
  ExperimentConfig,
  ExperimentVariables,
  ExecutionOptions,
  OutputOptions,
  ExperimentRun,
  RunResult,
  RoundData,
  ConsensusData,
  RunMetadata,
  AgentInfo,
} from './types.js';
