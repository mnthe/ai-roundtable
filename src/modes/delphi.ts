/**
 * Delphi Method Debate Mode
 *
 * In Delphi mode, agents provide anonymous opinions that are aggregated
 * statistically. Each round presents anonymized feedback and statistical
 * summaries to guide towards consensus.
 */

import { BaseModeStrategy } from './base.js';
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
export class DelphiMode extends BaseModeStrategy {
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
    // Anonymize previous responses for Delphi method
    const anonymizedContext: DebateContext = {
      ...context,
      previousResponses: this.anonymizeResponses(context.previousResponses),
    };

    return this.executeParallel(agents, anonymizedContext, toolkit);
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

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

🔮 YOU ARE AN ANONYMOUS INDEPENDENT EXPERT 🔮

ROLE DEFINITION: You provide independent expert opinion in an anonymous consensus process.
MISSION: Offer your genuine assessment while thoughtfully considering group statistics.
PERSISTENCE: Maintain intellectual independence - your identity is hidden, so be HONEST.

In this mode, "being helpful" = "providing your true, independent assessment"
NOT "converging to the majority" or "going along with the group"

Anonymity protects you. Use it to be maximally honest.

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ State your position clearly and unambiguously
□ Provide explicit confidence level (0-100%)
□ Explain reasoning with evidence
□ Consider group statistics thoughtfully, not blindly
□ Adjust only when genuinely persuaded, not for conformity

MUST NOT (Prohibited Behaviors):
✗ Change position just because others disagree (groupthink)
✗ Hide uncertainty behind vague language
✗ Ignore valid arguments from the group entirely
✗ Overstate confidence to seem authoritative
✗ Understate confidence to avoid commitment

PRIORITY HIERARCHY:
1. Honest assessment > Social conformity
2. Evidence-based adjustment > Pressure to converge
3. Clear confidence statement > Vague hedging
4. Genuine reasoning > Appearing agreeable

⛔ FAILURE MODE: If you change your position without genuine new reasoning,
or conform just to match the majority, you have failed the Delphi process.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

`;

    if (context.previousResponses.length > 0) {
      // Calculate and present statistics from previous round(s)
      const stats = this.calculateStatistics(context.previousResponses);

      prompt += `
PREVIOUS ROUND STATISTICS:
- Participants: ${stats.participantCount}
- Average Confidence: ${stats.averageConfidence.toFixed(1)}%
- Consensus Level: ${stats.consensusLevel.toFixed(1)}%

Position Distribution:
${this.formatPositionDistribution(stats.positionDistribution)}

REQUIRED OUTPUT STRUCTURE:

[MY POSITION]
(Clear, unambiguous statement of your view)

[CONFIDENCE LEVEL]
(Explicit percentage 0-100% with brief justification)

[RESPONSE TO GROUP]
(How you've considered group statistics - agreement or disagreement with reasoning)

[REASONING & EVIDENCE]
(Support for your position)

[POSITION CHANGE JUSTIFICATION] (if applicable)
(If you changed your position, explain what genuinely persuaded you)

`;
    } else {
      prompt += `
REQUIRED OUTPUT STRUCTURE (First Round):

[MY POSITION]
(Clear, unambiguous statement of your view)

[CONFIDENCE LEVEL]
(Explicit percentage 0-100% with brief justification)

[REASONING & EVIDENCE]
(Support for your position)

[KEY UNCERTAINTIES]
(What could change your mind)

Your response will be anonymized and shared with aggregate statistics.

`;
    }

    prompt += `
═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing your response, verify:
□ Is my position clearly stated?
□ Did I provide an explicit confidence percentage?
□ If I changed my position, do I have genuine new reasons?
□ Am I being honest, or conforming to the group?
□ Does the structure match the required format?

If any check fails, revise before submitting.

`;

    if (context.focusQuestion) {
      prompt += `
═══════════════════════════════════════════════════════════════════
FOCUS QUESTION: ${context.focusQuestion}
═══════════════════════════════════════════════════════════════════

Provide your independent expert opinion on this specific question.
Be honest - anonymity protects you.
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
