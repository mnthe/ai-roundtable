/**
 * Benchmark Script Type Definitions
 */

import type {
  DebateMode,
  AgentResponse,
  ConsensusResult,
  ContextRequest,
} from '../../src/types/index.js';

// ============================================================================
// Configuration Types
// ============================================================================

export interface ExperimentConfig {
  name: string;
  description?: string;
  variables: ExperimentVariables;
  options: ExecutionOptions;
  output: OutputOptions;
}

export interface ExperimentVariables {
  modes: DebateMode[];
  rounds: number[];
  topics: string[];
  agents: string[] | ['default'];
}

export interface ExecutionOptions {
  parallel: boolean;
  delay_between: number;
  retry_on_failure: number;
}

export interface OutputOptions {
  include_raw_responses: boolean;
  include_tool_calls: boolean;
  include_citations: boolean;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ExperimentRun {
  mode: DebateMode;
  topic: string;
  rounds: number;
  agents: string[];
}

export interface RunResult {
  runId: string;
  config: ExperimentRun;
  session: SessionData;
  roundsData: RoundData[];
  consensus: ConsensusData;
  metadata: RunMetadata;
}

export interface SessionData {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  totalRounds: number;
  status: string;
  createdAt: Date;
}

export interface RoundData {
  roundNumber: number;
  responses: AgentResponse[];
  consensusSnapshot?: {
    level: string;
    score: number;
  };
  /** Context requests made during this round (if any) */
  contextRequests?: ContextRequest[];
  durationMs: number;
}

export interface ConsensusData {
  finalLevel: string;
  finalScore: number;
  progression: Array<{
    round: number;
    score: number;
  }>;
  agreements: string[];
  disagreements: string[];
  summary?: string;
}

export interface RunMetadata {
  experimentName: string;
  runId: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  agents: AgentInfo[];
  error?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  provider: string;
  model: string;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface RunCommandOptions {
  dryRun?: boolean;
  filterMode?: DebateMode;
  output?: string;
}

export interface SingleCommandOptions {
  topic: string;
  mode: DebateMode;
  rounds: string;
  output?: string;
}

export interface ListCommandOptions {
  date?: string;
  experiment?: string;
}
