/**
 * Debate Engine - Orchestrates multi-agent debates
 */

import type {
  DebateContext,
  AgentResponse,
  RoundResult,
  ConsensusResult,
  Session,
} from '../types/index.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateModeStrategy } from '../modes/base.js';
import type { AIConsensusAnalyzer } from './ai-consensus-analyzer.js';

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
      throw new Error('AgentToolkit must be provided');
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
    // Get the appropriate mode strategy
    const strategy = this.modeStrategies.get(context.mode);
    if (!strategy) {
      // Fall back to simple round-robin if no strategy found
      const responses = await this.executeSimpleRound(agents, context);
      const consensus = await this.analyzeConsensusWithAI(responses, context.topic);
      return {
        roundNumber: context.currentRound,
        responses,
        consensus,
      };
    }

    // Use the strategy to execute the round
    const responses = await strategy.executeRound(agents, context, this.toolkit);
    const consensus = await this.analyzeConsensusWithAI(responses, context.topic);

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

    for (let i = 0; i < numRounds; i++) {
      const currentRound = session.currentRound + i + 1;
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
        console.error(`Error from agent ${agent.id}:`, error);
      }
    }

    return responses;
  }

  /**
   * Analyze consensus with AI when available, falling back to rule-based
   *
   * @param responses - Agent responses to analyze
   * @param topic - Debate topic for context
   * @returns Consensus analysis result
   */
  async analyzeConsensusWithAI(
    responses: AgentResponse[],
    topic: string
  ): Promise<ConsensusResult> {
    // Try AI analysis first if available
    if (this.aiConsensusAnalyzer) {
      try {
        return await this.aiConsensusAnalyzer.analyzeConsensus(responses, topic);
      } catch (error) {
        // Fall back to rule-based on error
        console.warn('[DebateEngine] AI consensus analysis failed, falling back to rule-based:', error);
      }
    }

    // Fall back to rule-based analysis
    return this.analyzeConsensus(responses);
  }

  /**
   * Analyze consensus from agent responses (rule-based fallback)
   *
   * This is a simple implementation that looks for common themes
   * Use analyzeConsensusWithAI for better semantic analysis
   */
  analyzeConsensus(responses: AgentResponse[]): ConsensusResult {
    if (responses.length === 0) {
      return {
        agreementLevel: 0,
        commonPoints: [],
        disagreementPoints: [],
        summary: 'No responses to analyze',
      };
    }

    // Simple heuristic: check average confidence and position similarity
    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

    // Extract common words from positions (very basic)
    const positions = responses.map((r) => r.position.toLowerCase());
    const commonWords = this.findCommonWords(positions);

    // Check for agreement by comparing positions
    const uniquePositions = new Set(positions);
    const agreementLevel = 1 - (uniquePositions.size - 1) / responses.length;

    return {
      agreementLevel: Math.max(0, Math.min(1, agreementLevel)),
      commonPoints: commonWords.slice(0, 5),
      disagreementPoints: uniquePositions.size > 1 ? Array.from(uniquePositions) : [],
      summary: this.generateConsensusSummary(responses, agreementLevel, avgConfidence),
    };
  }

  /**
   * Find common words across multiple strings
   */
  private findCommonWords(texts: string[]): string[] {
    if (texts.length === 0) return [];

    // Simple word frequency analysis
    const wordCounts = new Map<string, number>();

    for (const text of texts) {
      const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const uniqueWords = new Set(words);

      for (const word of uniqueWords) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Find words that appear in multiple responses
    const commonWords = Array.from(wordCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);

    return commonWords;
  }

  /**
   * Generate a consensus summary
   */
  private generateConsensusSummary(
    responses: AgentResponse[],
    agreementLevel: number,
    avgConfidence: number
  ): string {
    const agentCount = responses.length;

    if (agreementLevel > 0.8) {
      return `Strong consensus among ${agentCount} agents with ${Math.round(agreementLevel * 100)}% agreement (avg confidence: ${Math.round(avgConfidence * 100)}%)`;
    } else if (agreementLevel > 0.5) {
      return `Moderate agreement among ${agentCount} agents with ${Math.round(agreementLevel * 100)}% alignment (avg confidence: ${Math.round(avgConfidence * 100)}%)`;
    } else {
      return `Diverse perspectives from ${agentCount} agents with ${Math.round(agreementLevel * 100)}% agreement (avg confidence: ${Math.round(avgConfidence * 100)}%)`;
    }
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
