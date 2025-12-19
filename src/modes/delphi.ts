/**
 * Delphi Method Debate Mode
 *
 * In Delphi mode, agents provide anonymous opinions that are aggregated
 * statistically. Each round presents anonymized feedback and statistical
 * summaries to guide towards consensus.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Statistical summary for Delphi rounds
 */
interface DelphiStatistics {
  averageConfidence: number;
  positionDistribution: Map<string, number>;
  consensusLevel: number;
  participantCount: number;
}

/**
 * Delphi Method mode strategy
 *
 * Characteristics:
 * - Anonymous responses (agent names replaced with "Participant N")
 * - Statistical aggregation of confidence and positions
 * - Round-by-round feedback with statistics
 * - Parallel execution for independent opinions
 * - Convergence towards consensus through iteration
 */
export class DelphiMode implements DebateModeStrategy {
  readonly name = 'delphi';

  /**
   * Execute a Delphi round
   *
   * All agents respond in parallel with anonymized previous responses
   * and statistical summaries.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    // Anonymize previous responses for Delphi method
    const anonymizedContext: DebateContext = {
      ...context,
      previousResponses: this.anonymizeResponses(context.previousResponses),
    };

    // Execute all agents in parallel for independent opinions
    const responsePromises = agents.map((agent) => {
      agent.setToolkit(toolkit);
      return agent.generateResponse(anonymizedContext);
    });

    const responses = await Promise.all(responsePromises);
    return responses;
  }

  /**
   * Build Delphi-specific prompt
   *
   * Includes:
   * - Explanation of anonymous methodology
   * - Statistical summaries from previous rounds
   * - Instructions for independent assessment
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Delphi Method

You are participating in a Delphi process - a structured method for achieving consensus
through anonymous, iterative rounds of expert opinion.

Your role is to:
- Provide your independent, honest assessment
- Consider the anonymized opinions and statistics from previous rounds
- Refine your position based on collective insights
- Maintain objectivity and intellectual independence
- Express your confidence level clearly (0-100%)

`;

    if (context.previousResponses.length > 0) {
      // Calculate and present statistics from previous round(s)
      const stats = this.calculateStatistics(context.previousResponses);

      prompt += `
Previous Round Statistics:
- Participants: ${stats.participantCount}
- Average Confidence: ${stats.averageConfidence.toFixed(1)}%
- Consensus Level: ${stats.consensusLevel.toFixed(1)}%

Position Distribution:
${this.formatPositionDistribution(stats.positionDistribution)}

Review the anonymized responses below and consider:
- Where do experts agree? Where do they diverge?
- What new evidence or arguments have emerged?
- Should you adjust your position based on collective wisdom?
- What is your confidence level in your current assessment?

Maintain independence - do not simply converge to the majority view without good reason.

`;
    } else {
      prompt += `
This is the first round. Provide your initial independent assessment:
- State your position clearly
- Explain your reasoning and evidence
- Indicate your confidence level (0-100%)
- Identify key uncertainties or assumptions

Your response will be anonymized and shared with other participants along with
aggregate statistics in the next round.

`;
    }

    if (context.focusQuestion) {
      prompt += `
Focus Question: ${context.focusQuestion}

Provide your expert opinion specifically addressing this question.
`;
    }

    return prompt;
  }

  /**
   * Anonymize responses by replacing agent names
   *
   * Replaces actual agent names with "Participant 1", "Participant 2", etc.
   */
  private anonymizeResponses(responses: AgentResponse[]): AgentResponse[] {
    const anonymized: AgentResponse[] = [];
    let participantNumber = 1;

    for (const response of responses) {
      anonymized.push({
        ...response,
        agentId: `participant-${participantNumber}`,
        agentName: `Participant ${participantNumber}`,
      });
      participantNumber++;
    }

    return anonymized;
  }

  /**
   * Calculate statistical summary from responses
   */
  private calculateStatistics(responses: AgentResponse[]): DelphiStatistics {
    if (responses.length === 0) {
      return {
        averageConfidence: 0,
        positionDistribution: new Map(),
        consensusLevel: 0,
        participantCount: 0,
      };
    }

    // Calculate average confidence
    const totalConfidence = responses.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = (totalConfidence / responses.length) * 100;

    // Calculate position distribution
    const positionCounts = new Map<string, number>();
    for (const response of responses) {
      // Extract first sentence or key phrase as position
      const position = this.extractKeyPosition(response.position);
      positionCounts.set(position, (positionCounts.get(position) || 0) + 1);
    }

    // Calculate consensus level (how much agreement exists)
    const maxCount = Math.max(...Array.from(positionCounts.values()));
    const consensusLevel = (maxCount / responses.length) * 100;

    return {
      averageConfidence,
      positionDistribution: positionCounts,
      consensusLevel,
      participantCount: responses.length,
    };
  }

  /**
   * Extract key position from response text
   *
   * Takes the first sentence or up to 100 characters as the key position
   */
  private extractKeyPosition(position: string): string {
    // Extract first sentence or first 100 chars
    const firstSentence = position.split(/[.!?]/)[0];
    if (firstSentence && firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return position.substring(0, 100).trim() + '...';
  }

  /**
   * Format position distribution for display
   */
  private formatPositionDistribution(distribution: Map<string, number>): string {
    const entries = Array.from(distribution.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([position, count]) => `  - ${count} participant(s): "${position}"`);

    return entries.join('\n') || '  (No clear position clusters)';
  }
}
