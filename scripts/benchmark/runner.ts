/**
 * Benchmark Runner
 *
 * Main execution engine for running experiments.
 */

import { randomUUID } from 'node:crypto';
import { DebateEngine } from '../../src/core/debate-engine.js';
import { SessionManager } from '../../src/core/session-manager.js';
import { AgentRegistry } from '../../src/agents/registry.js';
import { setupAgents } from '../../src/agents/setup.js';
import { AIConsensusAnalyzer } from '../../src/core/ai-consensus-analyzer.js';
import { DefaultAgentToolkit } from '../../src/tools/toolkit.js';
import { createLogger } from '../../src/utils/logger.js';
import { ConfigLoader, generateMatrix } from './config.js';
import { DataCollector } from './collector.js';
import type { DebateMode, Session, AgentResponse, ConsensusResult, DebateConfig } from '../../src/types/index.js';
import type {
  ExperimentConfig,
  ExperimentRun,
  RunResult,
  RoundData,
  ConsensusData,
  RunMetadata,
  AgentInfo,
  RunCommandOptions,
  SingleCommandOptions,
} from './types.js';

const logger = createLogger('BenchmarkRunner');

export class BenchmarkRunner {
  private engine!: DebateEngine;
  private sessionManager!: SessionManager;
  private agentRegistry!: AgentRegistry;
  private collector: DataCollector;
  private initialized = false;

  constructor(outputDir?: string) {
    this.collector = new DataCollector(outputDir);
  }

  /**
   * Initialize the runner with all dependencies
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info({}, 'Initializing benchmark runner');

    // Setup agent registry with providers, agents, and health checks
    this.agentRegistry = new AgentRegistry();
    const setupResult = await setupAgents(this.agentRegistry);

    // Log warnings
    for (const warning of setupResult.warnings) {
      logger.warn({}, warning);
    }

    // Check if we have any active agents
    const activeAgents = this.agentRegistry.getActiveAgents();
    if (activeAgents.length === 0) {
      throw new Error('No active agents available. Please set API keys.');
    }

    logger.info({ agentCount: activeAgents.length }, 'Agents initialized');

    // Setup AI consensus analyzer
    const aiConsensusAnalyzer = new AIConsensusAnalyzer({
      registry: this.agentRegistry,
      fallbackToRuleBased: true,
    });

    // Setup toolkit
    const toolkit = new DefaultAgentToolkit();

    // Create debate engine
    this.engine = new DebateEngine({
      toolkit,
      aiConsensusAnalyzer,
    });

    // Create session manager (in-memory for benchmarks)
    this.sessionManager = new SessionManager({
      storageFilename: ':memory:',
    });

    this.initialized = true;
    logger.info({}, 'Benchmark runner initialized');
  }

  /**
   * Run experiment from config file
   */
  async runExperiment(configPath: string, options?: RunCommandOptions): Promise<void> {
    const configLoader = new ConfigLoader();
    const config = configLoader.load(configPath);

    // Generate run matrix
    let runs = generateMatrix(config.variables);

    // Apply filter if specified
    if (options?.filterMode) {
      runs = runs.filter((r) => r.mode === options.filterMode);
    }

    // Dry run - just print matrix (no initialization needed)
    if (options?.dryRun) {
      console.log('\n=== Experiment Matrix (Dry Run) ===\n');
      console.log(`Experiment: ${config.name}`);
      console.log(`Description: ${config.description ?? 'N/A'}`);
      console.log(`Total runs: ${runs.length}`);
      console.log('\nRuns:');
      for (const run of runs) {
        console.log(
          `  - Mode: ${run.mode}, Rounds: ${run.rounds}, Topic: "${run.topic.slice(0, 50)}..."`
        );
      }
      return;
    }

    // Initialize only for actual runs
    await this.initialize();

    logger.info({ name: config.name, configPath }, 'Starting experiment');
    logger.info({ totalRuns: runs.length }, 'Experiment matrix generated');

    // Execute runs
    let completed = 0;
    let failed = 0;

    for (const run of runs) {
      try {
        logger.info(
          { mode: run.mode, rounds: run.rounds, topic: run.topic.slice(0, 50) },
          `Running ${completed + 1}/${runs.length}`
        );

        const result = await this.executeSingleRun(run, config.name);
        const savedPath = await this.collector.save(result);

        completed++;
        logger.info({ savedPath }, `Run completed (${completed}/${runs.length})`);

        // Delay between runs
        if (config.options.delay_between > 0 && completed < runs.length) {
          await this.delay(config.options.delay_between);
        }
      } catch (error) {
        failed++;
        logger.error({ err: error, run }, 'Run failed');

        // Retry logic
        if (config.options.retry_on_failure > 0) {
          for (let retry = 1; retry <= config.options.retry_on_failure; retry++) {
            logger.info({ retry }, 'Retrying...');
            try {
              await this.delay(config.options.delay_between);
              const result = await this.executeSingleRun(run, config.name);
              await this.collector.save(result);
              failed--;
              completed++;
              break;
            } catch {
              logger.error({ retry }, 'Retry failed');
            }
          }
        }
      }
    }

    console.log('\n=== Experiment Complete ===');
    console.log(`Completed: ${completed}/${runs.length}`);
    console.log(`Failed: ${failed}`);
  }

  /**
   * Run a single experiment
   */
  async runSingle(options: SingleCommandOptions): Promise<void> {
    await this.initialize();

    const run: ExperimentRun = {
      mode: options.mode,
      topic: options.topic,
      rounds: parseInt(options.rounds, 10),
      agents: ['default'],
    };

    logger.info(
      { mode: run.mode, rounds: run.rounds, topic: run.topic },
      'Running single experiment'
    );

    const result = await this.executeSingleRun(run, 'single-run');
    const savedPath = await this.collector.save(result);

    console.log('\n=== Run Complete ===');
    console.log(`Saved to: ${savedPath}`);
  }

  /**
   * Execute a single run and collect all data
   */
  private async executeSingleRun(run: ExperimentRun, experimentName: string): Promise<RunResult> {
    const runId = `run-${randomUUID().slice(0, 8)}`;
    const startedAt = new Date();
    const roundsData: RoundData[] = [];

    // Get agent IDs
    const agentIds = this.resolveAgentIds(run.agents);

    // Create debate config
    const config: DebateConfig = {
      topic: run.topic,
      mode: run.mode,
      rounds: run.rounds,
      agents: agentIds,
    };

    // Create session
    const session = await this.sessionManager.createSession(config);

    // Get agents
    const agents = this.agentRegistry.getAgents(agentIds);

    // Execute all rounds
    const roundResults = await this.engine.executeRounds(agents, session, run.rounds);

    // Update session and collect round data
    await this.sessionManager.updateSessionRound(session.id, session.currentRound);
    for (const result of roundResults) {
      for (const response of result.responses) {
        await this.sessionManager.addResponse(session.id, response, result.roundNumber);
      }

      // Collect round data
      roundsData.push({
        roundNumber: result.roundNumber,
        responses: result.responses,
        consensusSnapshot: result.consensus
          ? {
              level: result.consensus.consensusLevel,
              score: result.consensus.agreementLevel,
            }
          : undefined,
        durationMs: 0, // Could track this per round if needed
      });
    }

    // Get final session state
    const finalSession = await this.sessionManager.getSession(session.id);
    const completedAt = new Date();

    // Build consensus data from round results
    const lastResult = roundResults[roundResults.length - 1];
    const consensus = this.buildConsensusDataFromResults(lastResult?.consensus, roundsData);

    // Build metadata
    const metadata: RunMetadata = {
      experimentName,
      runId,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      agents: this.getAgentInfo(agentIds),
    };

    return {
      runId,
      config: run,
      session: {
        sessionId: session.id,
        topic: session.topic,
        mode: session.mode,
        totalRounds: session.totalRounds,
        status: finalSession?.status ?? 'completed',
        createdAt: session.createdAt,
      },
      roundsData,
      consensus,
      metadata,
    };
  }

  /**
   * Resolve agent IDs from config
   */
  private resolveAgentIds(agents: string[]): string[] {
    if (agents.includes('default') || agents.length === 0) {
      return this.agentRegistry.getActiveAgents().map((a) => a.id);
    }
    return agents;
  }

  /**
   * Build consensus data from round results
   */
  private buildConsensusDataFromResults(
    finalConsensus: ConsensusResult | undefined,
    roundsData: RoundData[]
  ): ConsensusData {
    const progression = roundsData
      .filter((r) => r.consensusSnapshot)
      .map((r) => ({
        round: r.roundNumber,
        score: r.consensusSnapshot!.score,
      }));

    const agreementLevel = finalConsensus?.agreementLevel ?? 0;

    return {
      finalLevel: this.classifyConsensusLevel(agreementLevel),
      finalScore: agreementLevel,
      progression,
      agreements: finalConsensus?.commonGround ?? [],
      disagreements: finalConsensus?.disagreementPoints ?? [],
      summary: finalConsensus?.summary,
    };
  }

  /**
   * Classify consensus level based on agreement score
   * Matches the logic in src/mcp/handlers/utils.ts
   */
  private classifyConsensusLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Get agent info for metadata
   */
  private getAgentInfo(agentIds: string[]): AgentInfo[] {
    return agentIds.map((id) => {
      const agent = this.agentRegistry.getAgent(id);
      return {
        id,
        name: agent?.name ?? 'Unknown',
        provider: agent?.provider ?? 'unknown',
        model: agent?.model ?? 'unknown',
      };
    });
  }

  /**
   * List experiment results
   */
  listResults(options?: { date?: string; experiment?: string }): string[] {
    return this.collector.listResults(options);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
