/**
 * Debate Engine - Orchestrates multi-agent debates
 */

import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import { EXIT_CRITERIA_CONFIG, type ExitCriteriaConfig } from '../config/exit-criteria.js';
import { ConfigurationError } from '../errors/index.js';
import type { DebateModeStrategy } from '../modes/base.js';
import type { ModeRegistry } from '../modes/registry.js';
// Default import - can be overridden via options for dependency injection
import { getGlobalModeRegistry as defaultGetGlobalModeRegistry } from '../modes/registry.js';
import type {
  DebateContext,
  AgentResponse,
  RoundResult,
  ConsensusResult,
  Session,
  ExitCriteria,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import type { AIConsensusAnalyzer } from './ai-consensus-analyzer.js';
import { checkExitCriteria } from './exit-criteria.js';

const logger = createLogger('DebateEngine');

/** Type for mode registry getter function */
export type GetModeRegistryFn = () => ModeRegistry;

export interface DebateEngineOptions {
  toolkit?: AgentToolkit;
  aiConsensusAnalyzer?: AIConsensusAnalyzer;
  exitCriteriaConfig?: ExitCriteriaConfig;
  /** Optional mode registry getter (for dependency injection/testing) */
  getModeRegistry?: GetModeRegistryFn;
}

/**
 * DebateEngine
 *
 * Core engine that orchestrates debates between AI agents:
 * - Manages rounds of debate
 * - Coordinates agent responses
 * - Applies debate mode strategies
 * - Analyzes consensus (using AI when available, falling back to rule-based)
 */
export class DebateEngine {
  private toolkit: AgentToolkit;
  private modeStrategies: Map<string, DebateModeStrategy> = new Map();
  private aiConsensusAnalyzer?: AIConsensusAnalyzer;
  private exitCriteriaConfig: ExitCriteriaConfig;
  private getModeRegistry: GetModeRegistryFn;

  constructor(options: DebateEngineOptions = {}) {
    // Toolkit must be provided as it's an interface
    if (!options.toolkit) {
      throw new ConfigurationError('AgentToolkit must be provided to DebateEngine', {
        code: 'MISSING_TOOLKIT',
      });
    }
    this.toolkit = options.toolkit;
    this.aiConsensusAnalyzer = options.aiConsensusAnalyzer;
    this.exitCriteriaConfig = options.exitCriteriaConfig ?? EXIT_CRITERIA_CONFIG;
    // Allow injection but keep default for backward compatibility
    this.getModeRegistry = options.getModeRegistry ?? defaultGetGlobalModeRegistry;
  }

  /**
   * Register a debate mode strategy
   */
  registerMode(mode: string, strategy: DebateModeStrategy): void {
    this.modeStrategies.set(mode, strategy);
  }

  /**
   * Execute a single debate round
   *
   * @param agents - Array of agents participating
   * @param context - Current debate context
   * @returns Round results with responses, consensus, and any context requests
   */
  async executeRound(agents: BaseAgent[], context: DebateContext): Promise<RoundResult> {
    // Clear any pending context requests from previous operations
    this.toolkit.clearPendingRequests();

    // Set current context for toolkit tools (e.g., fact_check needs sessionId)
    this.toolkit.setContext(context);

    // Get the appropriate mode strategy (local first, then global registry)
    let strategy = this.modeStrategies.get(context.mode);
    if (!strategy) {
      // Try global mode registry using injected function
      const globalRegistry = this.getModeRegistry();
      strategy = globalRegistry.getMode(context.mode);
    }

    if (!strategy) {
      // Fall back to simple round-robin if no strategy found
      logger.warn({ mode: context.mode }, 'No mode strategy found, using simple round-robin');
      const responses = await this.executeSimpleRound(agents, context);
      // Default to including groupthink detection when no strategy is found
      const consensus = await this.analyzeConsensusWithAI(responses, context.topic, {
        includeGroupthinkDetection: true,
      });

      // Collect any context requests made during the round
      const contextRequests = this.toolkit.getPendingContextRequests();

      return {
        roundNumber: context.currentRound,
        responses,
        consensus,
        contextRequests: contextRequests.length > 0 ? contextRequests : undefined,
      };
    }

    // Use the strategy to execute the round
    const responses = await strategy.executeRound(agents, context, this.toolkit);
    // Get groupthink detection preference from mode strategy (default: true)
    const includeGroupthinkDetection = strategy.needsGroupthinkDetection ?? true;
    const consensus = await this.analyzeConsensusWithAI(responses, context.topic, {
      includeGroupthinkDetection,
    });

    // Collect any context requests made during the round
    const contextRequests = this.toolkit.getPendingContextRequests();

    return {
      roundNumber: context.currentRound,
      responses,
      consensus,
      contextRequests: contextRequests.length > 0 ? contextRequests : undefined,
    };
  }

  /**
   * Execute multiple debate rounds
   *
   * NOTE: This method intentionally mutates the session object for caller convenience.
   * After each round, session.responses is updated with new responses and
   * session.currentRound is incremented. This allows the caller to access the
   * updated session state without additional bookkeeping.
   *
   * @param agents - Array of agents participating
   * @param session - Current session state (mutated: responses and currentRound updated)
   * @param numRounds - Number of rounds to execute
   * @param focusQuestion - Optional focus question for the rounds
   * @param contextResults - Optional context results from previous batch
   * @returns Array of round results
   */
  async executeRounds(
    agents: BaseAgent[],
    session: Session,
    numRounds: number,
    focusQuestion?: string,
    contextResults?: import('../types/index.js').ContextResult[]
  ): Promise<RoundResult[]> {
    const results: RoundResult[] = [];
    // Store the starting round to calculate correct round numbers
    const startingRound = session.currentRound;

    // Track responses by round for exit criteria checking
    const responsesByRound: AgentResponse[][] = [];

    // Reconstruct previous rounds from session.responses
    // Group existing responses by round (assuming they are ordered)
    if (session.responses.length > 0 && startingRound > 0) {
      const responsesPerRound = Math.ceil(session.responses.length / startingRound);
      for (let r = 0; r < startingRound; r++) {
        const start = r * responsesPerRound;
        const end = Math.min(start + responsesPerRound, session.responses.length);
        responsesByRound.push(session.responses.slice(start, end));
      }
    }

    for (let i = 0; i < numRounds; i++) {
      const currentRound = startingRound + i + 1;
      const context: DebateContext = {
        sessionId: session.id,
        topic: session.topic,
        mode: session.mode,
        currentRound,
        totalRounds: session.totalRounds,
        previousResponses: session.responses,
        focusQuestion,
        // Only include contextResults in the first round of this batch
        // (they are responses to requests from the previous batch)
        contextResults: i === 0 ? contextResults : undefined,
        // Include perspectives for expert-panel mode
        perspectives: session.perspectives,
      };

      const result = await this.executeRound(agents, context);
      results.push(result);

      // Add responses to session for next round
      session.responses.push(...result.responses);
      session.currentRound = currentRound;

      // Track this round's responses for exit criteria
      responsesByRound.push(result.responses);

      // Check exit criteria if enabled (and not on the last planned round)
      if (this.exitCriteriaConfig.enabled && i < numRounds - 1) {
        const exitCriteria: ExitCriteria = {
          maxRounds: session.totalRounds,
          consensusThreshold: this.exitCriteriaConfig.consensusThreshold,
          convergenceRounds: this.exitCriteriaConfig.convergenceRounds,
        };

        const previousRounds = responsesByRound.slice(0, -1);
        const exitResult = checkExitCriteria(
          result.responses,
          previousRounds,
          exitCriteria,
          currentRound,
          result.consensus
        );

        if (exitResult.shouldExit) {
          logger.info(
            {
              sessionId: session.id,
              round: currentRound,
              reason: exitResult.reason,
              details: exitResult.details,
            },
            'Early exit triggered by exit criteria'
          );
          break;
        }
      }
    }

    return results;
  }

  /**
   * Simple round-robin execution (fallback when no strategy)
   */
  private async executeSimpleRound(
    agents: BaseAgent[],
    context: DebateContext
  ): Promise<AgentResponse[]> {
    const results = await Promise.allSettled(
      agents.map((agent) => agent.generateResponse(context))
    );

    const responses: AgentResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        responses.push(result.value);
      } else {
        logger.error({ err: result.reason }, 'Agent failed in simple round');
      }
    }
    return responses;
  }

  /**
   * Analyze consensus using AI
   *
   * @param responses - Agent responses to analyze
   * @param topic - Debate topic for context
   * @param options - Analysis options
   * @param options.includeGroupthinkDetection - Whether to include groupthink detection (default: true)
   * @returns Consensus analysis result
   * @throws Error if AI consensus analyzer is not available
   */
  async analyzeConsensusWithAI(
    responses: AgentResponse[],
    topic: string,
    options?: { includeGroupthinkDetection?: boolean }
  ): Promise<ConsensusResult> {
    if (!this.aiConsensusAnalyzer) {
      throw new ConfigurationError(
        'AI consensus analyzer not available. Configure aiConsensusAnalyzer in DebateEngineOptions.',
        { code: 'MISSING_CONSENSUS_ANALYZER' }
      );
    }

    return this.aiConsensusAnalyzer.analyzeConsensus(responses, topic, options);
  }

  /**
   * Get the current toolkit
   */
  getToolkit(): AgentToolkit {
    return this.toolkit;
  }

  /**
   * Set a new toolkit
   */
  setToolkit(toolkit: AgentToolkit): void {
    this.toolkit = toolkit;
  }
}
