/**
 * Debate Engine - Orchestrates multi-agent debates
 */

import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import { EXIT_CRITERIA_CONFIG } from '../config/exit-criteria.js';
import { ConfigurationError } from '../errors/index.js';
import type { DebateModeStrategy } from '../modes/base.js';
import { getGlobalModeRegistry } from '../modes/registry.js';
import type {
  DebateContext,
  AgentResponse,
  RoundResult,
  ConsensusResult,
  Session,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import type { AIConsensusAnalyzer } from './ai-consensus-analyzer.js';
import { checkExitCriteria, type ExitCriteria } from './exit-criteria.js';

const logger = createLogger('DebateEngine');

export interface DebateEngineOptions {
  toolkit?: AgentToolkit;
  aiConsensusAnalyzer?: AIConsensusAnalyzer;
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

  constructor(options: DebateEngineOptions = {}) {
    // Toolkit must be provided as it's an interface
    if (!options.toolkit) {
      throw new ConfigurationError('AgentToolkit must be provided to DebateEngine', {
        code: 'MISSING_TOOLKIT',
      });
    }
    this.toolkit = options.toolkit;
    this.aiConsensusAnalyzer = options.aiConsensusAnalyzer;
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
   * @returns Round results with responses and consensus
   */
  async executeRound(agents: BaseAgent[], context: DebateContext): Promise<RoundResult> {
    // Get the appropriate mode strategy (local first, then global registry)
    let strategy = this.modeStrategies.get(context.mode);
    if (!strategy) {
      // Try global mode registry
      const globalRegistry = getGlobalModeRegistry();
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
      return {
        roundNumber: context.currentRound,
        responses,
        consensus,
      };
    }

    // Use the strategy to execute the round
    const responses = await strategy.executeRound(agents, context, this.toolkit);
    // Get groupthink detection preference from mode strategy (default: true)
    const includeGroupthinkDetection = strategy.needsGroupthinkDetection ?? true;
    const consensus = await this.analyzeConsensusWithAI(responses, context.topic, {
      includeGroupthinkDetection,
    });

    return {
      roundNumber: context.currentRound,
      responses,
      consensus,
    };
  }

  /**
   * Execute multiple debate rounds
   *
   * @param agents - Array of agents participating
   * @param session - Current session state
   * @param numRounds - Number of rounds to execute
   * @param focusQuestion - Optional focus question for the rounds
   * @returns Array of round results
   */
  async executeRounds(
    agents: BaseAgent[],
    session: Session,
    numRounds: number,
    focusQuestion?: string
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
      };

      const result = await this.executeRound(agents, context);
      results.push(result);

      // Add responses to session for next round
      session.responses.push(...result.responses);
      session.currentRound = currentRound;

      // Track this round's responses for exit criteria
      responsesByRound.push(result.responses);

      // Check exit criteria if enabled (and not on the last planned round)
      if (EXIT_CRITERIA_CONFIG.enabled && i < numRounds - 1) {
        const exitCriteria: ExitCriteria = {
          maxRounds: session.totalRounds,
          consensusThreshold: EXIT_CRITERIA_CONFIG.consensusThreshold,
          convergenceRounds: EXIT_CRITERIA_CONFIG.convergenceRounds,
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
    const responses: AgentResponse[] = [];

    for (const agent of agents) {
      try {
        const response = await agent.generateResponse(context);
        responses.push(response);
      } catch (error) {
        // Log error but continue with other agents
        logger.error({ err: error, agentId: agent.id }, 'Error from agent');
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
      throw new Error('AI consensus analyzer not available. Configure aiConsensusAnalyzer in DebateEngineOptions.');
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
