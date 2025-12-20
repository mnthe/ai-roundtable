/**
 * Context Processors - Reusable context transformations for debate modes
 *
 * Processors transform DebateContext before it's passed to agents.
 * They enable reusable transformations like anonymization and statistics injection
 * that can be composed across different modes.
 */

import type { BaseAgent } from '../../agents/base.js';
import type { AgentResponse, DebateContext, Stance } from '../../types/index.js';

// ============================================
// Interfaces
// ============================================

/**
 * Interface for context processors.
 * Processors transform DebateContext to add or modify information before agents receive it.
 */
export interface ContextProcessor {
  /** Unique name for the processor */
  readonly name: string;

  /**
   * Process and transform a debate context.
   * @param context - The debate context to process
   * @param agent - Optional agent for agent-specific processing
   * @returns The processed (possibly modified) context
   */
  process(context: DebateContext, agent?: BaseAgent): DebateContext;
}

// ============================================
// Processors
// ============================================

/**
 * Replaces agent identities with generic participant labels.
 * Used in Delphi mode and other anonymous debate formats.
 */
export class AnonymizationProcessor implements ContextProcessor {
  readonly name = 'anonymization';

  process(context: DebateContext, _agent?: BaseAgent): DebateContext {
    if (context.previousResponses.length === 0) {
      return context;
    }

    return {
      ...context,
      previousResponses: context.previousResponses.map((response, index) => ({
        ...response,
        agentId: `participant-${index + 1}`,
        agentName: `Participant ${index + 1}`,
      })),
    };
  }
}

/**
 * Statistics calculated from debate responses
 */
export interface RoundStatistics {
  /** Number of responses/participants */
  participantCount: number;
  /** Average confidence across all responses (0-100) */
  averageConfidence: number;
  /** Distribution of stance counts (for structured modes) */
  stanceDistribution: Record<Stance, number>;
  /** Position distribution by first sentence/key phrase */
  positionDistribution: Map<string, number>;
  /** Consensus level based on most common position (0-100) */
  consensusLevel: number;
}

/**
 * Injects round statistics into the context's modePrompt.
 * Calculates average confidence, position distribution, and stance counts.
 */
export class StatisticsProcessor implements ContextProcessor {
  readonly name = 'statistics';

  process(context: DebateContext, _agent?: BaseAgent): DebateContext {
    if (context.previousResponses.length === 0) {
      return context;
    }

    const stats = this.calculateStats(context.previousResponses);
    const statsText = this.formatStats(stats);

    return {
      ...context,
      modePrompt: (context.modePrompt ?? '') + `\n\nRound Statistics:\n${statsText}`,
    };
  }

  /**
   * Calculate statistics from responses.
   */
  calculateStats(responses: AgentResponse[]): RoundStatistics {
    if (responses.length === 0) {
      return {
        participantCount: 0,
        averageConfidence: 0,
        stanceDistribution: { YES: 0, NO: 0, NEUTRAL: 0 },
        positionDistribution: new Map(),
        consensusLevel: 0,
      };
    }

    // Calculate average confidence (convert from 0-1 to 0-100)
    const totalConfidence = responses.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = (totalConfidence / responses.length) * 100;

    // Calculate stance distribution
    const stanceDistribution: Record<Stance, number> = { YES: 0, NO: 0, NEUTRAL: 0 };
    for (const response of responses) {
      if (response.stance) {
        stanceDistribution[response.stance]++;
      }
    }

    // Calculate position distribution
    const positionDistribution = new Map<string, number>();
    for (const response of responses) {
      const keyPosition = this.extractKeyPosition(response.position);
      positionDistribution.set(keyPosition, (positionDistribution.get(keyPosition) || 0) + 1);
    }

    // Calculate consensus level (percentage of most common position)
    const maxCount = Math.max(...Array.from(positionDistribution.values()), 0);
    const consensusLevel = responses.length > 0 ? (maxCount / responses.length) * 100 : 0;

    return {
      participantCount: responses.length,
      averageConfidence,
      stanceDistribution,
      positionDistribution,
      consensusLevel,
    };
  }

  /**
   * Format statistics as a string for inclusion in modePrompt.
   */
  private formatStats(stats: RoundStatistics): string {
    const lines: string[] = [];

    lines.push(`- Participants: ${stats.participantCount}`);
    lines.push(`- Average Confidence: ${stats.averageConfidence.toFixed(1)}%`);
    lines.push(`- Consensus Level: ${stats.consensusLevel.toFixed(1)}%`);

    // Only show stance distribution if any stances are present
    const totalStances =
      stats.stanceDistribution.YES + stats.stanceDistribution.NO + stats.stanceDistribution.NEUTRAL;
    if (totalStances > 0) {
      lines.push(`- Stance Distribution: YES=${stats.stanceDistribution.YES}, NO=${stats.stanceDistribution.NO}, NEUTRAL=${stats.stanceDistribution.NEUTRAL}`);
    }

    // Show position distribution
    if (stats.positionDistribution.size > 0) {
      lines.push('- Position Distribution:');
      const sortedPositions = Array.from(stats.positionDistribution.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Limit to top 5 positions

      for (const [position, count] of sortedPositions) {
        lines.push(`  - ${count} participant(s): "${position}"`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Extract key position from response text.
   * Takes the first sentence or up to 100 characters as the key position.
   */
  private extractKeyPosition(position: string): string {
    if (!position || position.trim() === '') {
      return '(No position)';
    }

    // Extract first sentence or first 100 chars
    const firstSentence = position.split(/[.!?]/)[0];
    if (firstSentence && firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return position.substring(0, 100).trim() + '...';
  }
}

/**
 * Combines multiple processors into a single chain.
 * Processors are applied in order, with each receiving the output of the previous.
 */
export class ProcessorChain implements ContextProcessor {
  readonly name = 'chain';

  constructor(private processors: ContextProcessor[]) {}

  process(context: DebateContext, agent?: BaseAgent): DebateContext {
    return this.processors.reduce(
      (ctx, processor) => processor.process(ctx, agent),
      context
    );
  }

  /**
   * Get the list of processors in this chain.
   */
  getProcessors(): readonly ContextProcessor[] {
    return this.processors;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Creates an AnonymizationProcessor that replaces agent identities with generic labels.
 */
export function createAnonymizationProcessor(): AnonymizationProcessor {
  return new AnonymizationProcessor();
}

/**
 * Creates a StatisticsProcessor that injects round statistics into context.
 */
export function createStatisticsProcessor(): StatisticsProcessor {
  return new StatisticsProcessor();
}

/**
 * Creates a ProcessorChain that applies multiple processors in sequence.
 * @param processors - Array of processors to chain together
 */
export function createProcessorChain(processors: ContextProcessor[]): ProcessorChain {
  return new ProcessorChain(processors);
}
